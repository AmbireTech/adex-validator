#!/usr/bin/env node
/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-param-reassign */
// const assert = require('assert')
const ethers = require('ethers')

const { Contract, getDefaultProvider } = ethers
const { bigNumberify, hexlify, Interface, id } = ethers.utils
const fetch = require('node-fetch')
const { Channel, Transaction, MerkleTree, splitSig } = require('adex-protocol-eth/js')
const identityAbi = require('adex-protocol-eth/abi/Identity')

const db = require('../../db')
const cfg = require('../../cfg')
const adapters = require('../../adapters')
const {
	getDistributionForPeriodWithMultiplier,
	ZERO,
	parseBalancerTransferEvents,
	parseUniswapTransferEvents,
	ADX_TOKEN,
	DISTRIBUTION_IDENTITY,
	FEE_TOKEN,
	UNISWAP_ADX_ETH_ROUTER_ADDRESS,
	BALANCER_ADX_YUSD_EXCHANGE_ADDRESS
} = require('./lib')

const coreAddr = cfg.ETHEREUM_CORE_ADDR

const DISTRIBUTION_STARTS = new Date('2020-08-04T00:00:00.000Z')
const DISTRIBUTION_ENDS = new Date('2020-12-31T00:00:00.000Z')

const INCENTIVE_CHANNEL_OPEN_FEE = bigNumberify('1500000000000000000')
const INCENTIVE_TO_DISTRIBUTE = bigNumberify('7010000000000000000000000')
const DISTRIBUTION_PER_SECOND = bigNumberify('478927203065134100')

const provider = getDefaultProvider('homestead')
const Identity = new Contract(DISTRIBUTION_IDENTITY, identityAbi, provider)
const ADXToken = new Contract(
	ADX_TOKEN,
	['function balanceOf(address owner) view returns (uint)'],
	provider
)
const Balancer = new Contract(
	BALANCER_ADX_YUSD_EXCHANGE_ADDRESS,
	[
		{
			anonymous: false,
			inputs: [
				{
					indexed: true,
					name: 'src',
					type: 'address'
				},
				{
					indexed: true,
					name: 'dst',
					type: 'address'
				},
				{
					indexed: false,
					name: 'amt',
					type: 'uint256'
				}
			],
			name: 'Transfer',
			type: 'event'
		}
	],
	provider
)
const Uniswap = new Contract(
	UNISWAP_ADX_ETH_ROUTER_ADDRESS,
	[
		{
			anonymous: false,
			inputs: [
				{
					indexed: true,
					name: 'from',
					type: 'address'
				},
				{
					indexed: true,
					name: 'to',
					type: 'address'
				},
				{
					indexed: false,
					name: 'value',
					type: 'uint256'
				}
			],
			name: 'Transfer',
			type: 'event'
		}
	],
	provider
)
const idInterface = new Interface(identityAbi)

const keystoreFile = process.argv[2]
const keystorePwd = process.env.KEYSTORE_PWD
if (!(keystoreFile && keystorePwd)) {
	console.log(`Usage: KEYSTORE_PWD=... .${process.argv[1]} <path to keystore file>`)
	process.exit(1)
}

const adapter = new adapters.ethereum.Adapter(
	{
		keystoreFile,
		keystorePwd: process.env.KEYSTORE_PWD
	},
	cfg,
	provider
)

const LIQUIDITY_DURATION_BY_MULTIPLIER = {
	1: 10, // 1 week => 0.1% increase
	2: 20,
	3: 30
}

async function relayerPost(url, body) {
	const r = await fetch(cfg.ETHEREUM_ADAPTER_RELAYER + url, {
		headers: { 'content-type': 'application/json' },
		method: 'POST',
		body: JSON.stringify(body)
	})
	const responseBody = await r.json()
	if (r.status !== 200) throw responseBody
	return responseBody
}

async function calculateTotalDistribution() {
	const distribution = {}
	const uniswapDistribution = () =>
		calculateDistribution(
			distribution,
			Uniswap,
			UNISWAP_ADX_ETH_ROUTER_ADDRESS,
			parseUniswapTransferEvents
		)
	const balancerDistribution = () =>
		calculateDistribution(
			distribution,
			Balancer,
			BALANCER_ADX_YUSD_EXCHANGE_ADDRESS,
			parseBalancerTransferEvents
		)

	const { periodTotalActiveStake: currentTotalActiveStakeUniswap } = await uniswapDistribution()
	const { periodTotalActiveStake: currentTotalActiveStakeBalancer } = await balancerDistribution()

	return {
		distribution,
		currentTotalActiveStakeUniswap: currentTotalActiveStakeUniswap.toString(),
		currentTotalActiveStakeBalancer: currentTotalActiveStakeBalancer.toString()
	}
}

async function calculateDistribution(distribution, contractInterface, address, processEvLog) {
	const now = Math.floor(Date.now() / 1000)
	const distributionStarts = DISTRIBUTION_STARTS.getTime() / 1000
	const distributionEnds = DISTRIBUTION_ENDS.getTime() / 1000
	const logs = await provider.getLogs({
		fromBlock: 0,
		address,
		topics: [id('Transfer(address,address,uint256)')]
	})
	const parsedLogs = await Promise.all(
		logs
			.map(log => ({ ...contractInterface.interface.parseLog(log), blockNumber: log.blockNumber }))
			.map(async l => ({ ...l, time: await getBlockTimestamp(l.blockNumber) }))
	)

	return getDistributionForPeriodWithMultiplier(
		distribution,
		parsedLogs,
		distributionStarts,
		Math.min(now, distributionEnds),
		DISTRIBUTION_PER_SECOND,
		processEvLog,
		LIQUIDITY_DURATION_BY_MULTIPLIER
	)
}

async function getBlockTimestamp(blockNumber) {
	const block = await provider.getBlock(blockNumber)
	return block.timestamp
}

async function main() {
	console.log(`Distribution identity: ${DISTRIBUTION_IDENTITY}`)

	await adapter.init()
	await adapter.unlock()

	// Safety check: whether we have sufficient privileges
	if ((await Identity.privileges(adapter.whoami())) < 2) {
		console.log(`Insufficient privilege in the distribution identity (${DISTRIBUTION_IDENTITY})`)
		process.exit(1)
	}

	const {
		distribution,
		currentTotalActiveStakeUniswap,
		currentTotalActiveStakeBalancer
	} = await calculateTotalDistribution()

	const distributed = Object.values(distribution).reduce((a, b) => a.add(b), ZERO)
	if (distributed.gt(INCENTIVE_TO_DISTRIBUTE)) {
		console.error('Fatal error: calculated amount to distribute is more than the intended maximum!')
		process.exit(1)
	}

	await db.connect()
	const rewardChannels = db.getMongo().collection('lpRewardChannels')

	const channelArgs = {
		creator: DISTRIBUTION_IDENTITY,
		tokenAddr: ADXToken.address,
		tokenAmount: INCENTIVE_TO_DISTRIBUTE.toString(10),
		validUntil: DISTRIBUTION_ENDS.getTime() / 1000 + 2592000, // @TODO undecided
		validators: [adapter.whoami(), adapter.whoami()],
		// This one may produce diff results depending on timezone
		// spec: id(POOL_ID + DISTRIBUTION_STARTS.toString())
		spec: '0xf72ffa0786a2d5294679c87728c5df56f1f57910de95e738a0db0e4f9952319b'
	}

	const channel = new Channel({
		...channelArgs,
		spec: Buffer.from(channelArgs.spec.slice(2), 'hex')
	})
	const channelId = channel.hashHex(coreAddr)

	if (!(await rewardChannels.countDocuments({ channelId }))) {
		// Open the channel
		const openTxRaw = {
			identityContract: DISTRIBUTION_IDENTITY,
			nonce: (await Identity.nonce()).toNumber(),
			feeTokenAddr: FEE_TOKEN,
			feeAmount: INCENTIVE_CHANNEL_OPEN_FEE.toString(10),
			to: DISTRIBUTION_IDENTITY,
			data: hexlify(idInterface.functions.channelOpen.encode([coreAddr, channel.toSolidityTuple()]))
		}
		const openTx = new Transaction(openTxRaw)
		const txSig = splitSig(await adapter.sign(openTx.hash()))
		await relayerPost(`/identity/${DISTRIBUTION_IDENTITY}/execute`, {
			signatures: [txSig],
			txnsRaw: [openTxRaw]
		})
	}

	// Prepare the balance tree and signatures that will grant the ability to withdraw
	const tree = new MerkleTree(
		Object.entries(distribution).map(([addr, value]) =>
			Channel.getBalanceLeaf(addr, value.toString(10))
		)
	)
	const stateRoot = tree.getRoot()
	const hashToSign = channel.hashToSign(coreAddr, stateRoot)
	const balancesSig = splitSig(await adapter.sign(hashToSign))

	// The record that we are going to be saving in the DB
	const rewardRecord = {
		_id: channelId,
		channelId,
		channelArgs,
		balances: Object.fromEntries(
			Object.entries(distribution).map(([addr, value]) => [addr, value.toString(10)])
		),
		// The same validator is assigned for both slots
		signatures: [balancesSig, balancesSig],
		periodStart: DISTRIBUTION_STARTS,
		periodEnd: DISTRIBUTION_ENDS,
		stats: {
			currentRewardPerSecond: DISTRIBUTION_PER_SECOND.toString(),
			currentTotalActiveStakeUniswap,
			currentTotalActiveStakeBalancer
		}
	}
	await rewardChannels.updateOne({ _id: channelId }, { $set: rewardRecord }, { upsert: true })

	console.log(
		`Successfully distributed a total of ${(distributed.toString(10) / 10 ** 18).toFixed(4)} ADX`
	)

	process.exit(0)
}

main().catch(e => {
	console.error(e)
	process.exit(1)
})
