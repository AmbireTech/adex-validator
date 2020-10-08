#!/usr/bin/env node
/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-param-reassign */
// const assert = require('assert')
const ethers = require('ethers')

const { Contract, getDefaultProvider } = ethers
const { bigNumberify, hexlify, Interface, id } = ethers.utils
const fetch = require('node-fetch')
const { Channel, Transaction, MerkleTree, splitSig } = require('adex-protocol-eth/js')
const identityAbi = require('adex-protocol-eth/abi/Identity')

const db = require('../db')
const cfg = require('../cfg')
const adapters = require('../adapters')

const ADX_TOKEN = '0xADE00C28244d5CE17D72E40330B1c318cD12B7c3'
const DISTRIBUTION_IDENTITY = '0xe3C19038238De9bcc3E735ec4968eCd45e04c837'
const FEE_TOKEN = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
const UNISWAP_ADX_ETH_ROUTER = '0xD3772A963790feDE65646cFdae08734A17cd0f47'
const BALANCER_ADX_YUSD_EXCHANGE = '0x415900c6e18b89531e3e24c902b05c031c71a925'
const EXCLUDE_ADDRESSES = [
	'0x23C2c34f38ce66ccC10E71e9bB2A06532D52C5E9',
	'0x913bBB4c71DA6E88F90BF7e53E6b1310d75d306e'
]
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'
const coreAddr = cfg.ETHEREUM_CORE_ADDR

const DISTRIBUTION_STARTS = new Date('2020-08-04T00:00:00.000Z')
const DISTRIBUTION_ENDS = new Date('2020-12-31T00:00:00.000Z')

const INCENTIVE_CHANNEL_OPEN_FEE = bigNumberify('1500000000000000000')
const INCENTIVE_TO_DISTRIBUTE = bigNumberify('7010000000000000000000000')
const DISTRIBUTION_PER_SCEOND = bigNumberify('478927203065134100')
const ZERO = bigNumberify(0)

const provider = getDefaultProvider('homestead')
const Identity = new Contract(DISTRIBUTION_IDENTITY, identityAbi, provider)
const ADXToken = new Contract(
	ADX_TOKEN,
	['function balanceOf(address owner) view returns (uint)'],
	provider
)
const Balancer = new Contract(
	BALANCER_ADX_YUSD_EXCHANGE,
	['event Transfer(address indexed src, address indexed dst, uint amt)'],
	provider
)
const Uniswap = new Contract(
	UNISWAP_ADX_ETH_ROUTER,
	['event Transfer(address indexed from, address indexed to, uint value)'],
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
		keystoreFile: process.argv[2],
		keystorePwd: process.env.KEYSTORE_PWD
	},
	cfg,
	provider
)

const LIQUIDITY_DURATION_BY_MULTIPLIER = {
	1: 10,
	2: 20,
	3: 30
}

function addToMap(map, key, val) {
	if (!map[key]) map[key] = val
	else map[key] = map[key].add(val)
	return map
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
		processEventLogs(
			distribution,
			Uniswap.interface.parseLog,
			UNISWAP_ADX_ETH_ROUTER,
			processUniswapLog
		)
	const balancerDistribution = () =>
		processEventLogs(
			distribution,
			Balancer.interface.parseLog,
			BALANCER_ADX_YUSD_EXCHANGE,
			processBalancerLog
		)

	await uniswapDistribution()
	await balancerDistribution()
	return distribution
}

async function processEventLogs(distribution, parseLog, address, loopProcess) {
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
			.map(log => ({ ...parseLog(log), blockNumber: log.blockNumber }))
			.map(async l => ({ ...l, time: await getBlockTimestamp(l.blockNumber) }))
	)

	return getDistributionForPeriodWithMultiplier(
		distribution,
		parsedLogs,
		distributionStarts,
		Math.min(now, distributionEnds),
		DISTRIBUTION_PER_SCEOND,
		loopProcess
	)
}

async function getBlockTimestamp(blockNumber) {
	const block = await provider.getBlock(blockNumber)
	return block.timestamp
}

function processBalancerLog(log, currentLiquidityByUser, liquidityDuration) {
	const { time } = log
	const { src, dst, amt } = log.values

	if (
		src !== BALANCER_ADX_YUSD_EXCHANGE &&
		src !== NULL_ADDRESS &&
		!EXCLUDE_ADDRESSES.includes(src)
	) {
		currentLiquidityByUser[src] = currentLiquidityByUser[src].sub(amt)
		liquidityDuration[src] = time
	}

	if (
		dst !== BALANCER_ADX_YUSD_EXCHANGE &&
		dst !== NULL_ADDRESS &&
		!EXCLUDE_ADDRESSES.includes(dst)
	) {
		currentLiquidityByUser[dst] = currentLiquidityByUser[dst].add(amt)
		liquidityDuration[dst] = time
	}
}

function processUniswapLog(log, currentLiquidityByUser, liquidityDuration) {
	const { time } = log
	const { from, value, to } = log.values
	if (from !== NULL_ADDRESS && !EXCLUDE_ADDRESSES.includes(from)) {
		currentLiquidityByUser[from] = currentLiquidityByUser[from].sub(value)
		liquidityDuration[from] = time
	}

	if (to !== NULL_ADDRESS && !EXCLUDE_ADDRESSES.includes(to)) {
		addToMap(currentLiquidityByUser, to, value)
		liquidityDuration[to] = time
	}
}

function getDistributionForPeriodWithMultiplier(
	distribution = {},
	parsedLogs,
	startSeconds,
	endSeconds,
	perSecond,
	processEvLog
) {
	const ONE_WEEK = 604800
	const currentLiquidityByUser = {}
	const currentLiquidityByUserTimestamp = {}
	let currentTime = 0

	const tally = (start, end) => {
		const usedStart = Math.max(startSeconds, start)
		const usedEnd = Math.min(endSeconds, end)
		const delta = usedEnd - usedStart
		if (!(delta > 0)) return
		const totalDistribution = perSecond.mul(delta)
		const scaledLiquidityByUser = {}
		for (const addr of Object.keys(currentLiquidityByUser)) {
			const userTime = currentLiquidityByUserTimestamp[addr]
			const multiplierDelta = Math.floor((usedEnd - userTime) / ONE_WEEK)
			const multiplier = bigNumberify(LIQUIDITY_DURATION_BY_MULTIPLIER[multiplierDelta] || 0)
			addToMap(
				scaledLiquidityByUser,
				addr,
				currentLiquidityByUser[addr].add(
					currentLiquidityByUser[addr].mul(multiplier).div(bigNumberify(100))
				)
			)
		}
		const totalStake = Object.values(scaledLiquidityByUser).reduce((a, b) => a.add(b), ZERO)
		for (const addr of Object.keys(currentLiquidityByUser)) {
			addToMap(
				distribution,
				addr,
				totalDistribution.mul(scaledLiquidityByUser[addr]).div(totalStake)
			)
		}
	}

	for (const log of parsedLogs) {
		tally(currentTime, log.time)
		processEvLog(log, currentLiquidityByUser, currentLiquidityByUserTimestamp)
		currentTime = log.time
	}

	tally(currentTime, Math.floor(Date.now() / 1000))

	return distribution
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

	const distribution = await calculateTotalDistribution()
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
		periodEnd: DISTRIBUTION_ENDS
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
