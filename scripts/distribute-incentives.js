#!/usr/bin/env node
/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-param-reassign */
// const assert = require('assert')
const ethers = require('ethers')

const { Contract, getDefaultProvider } = ethers
const { keccak256, defaultAbiCoder, id, bigNumberify, hexlify, Interface } = ethers.utils
const fetch = require('node-fetch')
const { Channel, Transaction, MerkleTree, splitSig } = require('adex-protocol-eth/js')
const stakingAbi = require('adex-protocol-eth/abi/Staking')
const identityAbi = require('adex-protocol-eth/abi/Identity')

const db = require('../db')
const cfg = require('../cfg')
const adapters = require('../adapters')

const ADDR_STAKING = '0x4846c6837ec670bbd1f5b485471c8f64ecb9c534'

const DISTRIBUTION_IDENTITY = '0xe3C19038238De9bcc3E735ec4968eCd45e04c837'
const ADX_TOKEN = '0xADE00C28244d5CE17D72E40330B1c318cD12B7c3'
const FEE_TOKEN = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
const DISTRIBUTION_STARTS = new Date('2020-08-04T00:00:00.000Z')
const DISTRIBUTION_ENDS = new Date('2020-12-31T00:00:00.000Z')
const POOL_ID = id('validator:0x2892f6C41E0718eeeDd49D98D648C789668cA67d') // '0x2ce0c96383fb229d9776f33846e983a956a7d95844fac57b180ed0071d93bb28'

const INCENTIVE_CHANNEL_OPEN_FEE = bigNumberify('1500000000000000000')
const INCENTIVE_TO_DISTRIBUTE = bigNumberify('7010000000000000000000000')

const provider = getDefaultProvider('homestead')
const Staking = new Contract(ADDR_STAKING, stakingAbi, provider)
const Identity = new Contract(DISTRIBUTION_IDENTITY, identityAbi, provider)
const ADXToken = new Contract(
	ADX_TOKEN,
	['function balanceOf(address owner) view returns (uint)'],
	provider
)
const idInterface = new Interface(identityAbi)

const coreAddr = cfg.ETHEREUM_CORE_ADDR

const ZERO = bigNumberify(0)

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

function getBondId({ owner, amount, poolId, nonce }) {
	return keccak256(
		defaultAbiCoder.encode(
			['address', 'address', 'uint', 'bytes32', 'uint'],
			[ADDR_STAKING, owner, amount, poolId, nonce]
		)
	)
}

function addToMap(map, key, val) {
	if (!map[key]) map[key] = val
	else map[key] = map[key].add(val)
	return map
}

function getDistributionForPeriod(parsedLogs, startSeconds, endSeconds, perSecond) {
	// @TODO: implement pools
	// @TODO: implement slashing: currently since there's no slashing, it's all proportional to the total bonded amount
	// this will be kind tricky with unbonding since we have to .sub the exact post-slash amount (effectiveAmount)
	const distribution = {}
	const currentStakedByUser = {}
	const bonds = {}
	let currentTime = 0
	const tally = (start, end) => {
		const usedStart = Math.max(startSeconds, start)
		const usedEnd = Math.min(endSeconds, end)
		const delta = usedEnd - usedStart
		if (!(delta > 0)) return
		const totalStake = Object.values(currentStakedByUser).reduce((a, b) => a.add(b), ZERO)
		const totalDistribution = perSecond.mul(delta)
		for (const addr of Object.keys(currentStakedByUser)) {
			addToMap(distribution, addr, totalDistribution.mul(currentStakedByUser[addr]).div(totalStake))
		}
	}

	for (const log of parsedLogs) {
		tally(currentTime, log.values.time.toNumber())
		if (log.name === 'LogBond') {
			addToMap(currentStakedByUser, log.values.owner, log.values.amount)
			bonds[getBondId(log.values)] = log.values
		}
		if (log.name === 'LogUnbondRequested') {
			currentStakedByUser[log.values.owner] = currentStakedByUser[log.values.owner].sub(
				bonds[log.values.bondId].amount
			)
		}
		currentTime = log.values.time.toNumber()
	}
	tally(currentTime, endSeconds)

	return distribution
}

async function calculateTotalDistribution() {
	// From infura's docs: https://infura.io/docs/ethereum/json-rpc/eth-getLogs
	// A max of 10,000 results can be returned by a single query
	const logs = await provider.getLogs({ fromBlock: 0, address: ADDR_STAKING })
	if (logs.length === 10000)
		throw new Error('max limit of getLogs reached; we must reimplement the way we get logs')

	const parsedLogs = logs.map(log => Staking.interface.parseLog(log))
	const now = Math.floor(Date.now() / 1000)
	const distributionStarts = DISTRIBUTION_STARTS.getTime() / 1000
	const distributionEnds = DISTRIBUTION_ENDS.getTime() / 1000
	const earlyBirdEnds = 1599177600
	const earlyBirdSubscriptionEnds = 1597276800

	const distribution = getDistributionForPeriod(
		parsedLogs,
		distributionStarts,
		Math.min(now, distributionEnds),
		bigNumberify('478927203065134100')
	)
	const fromEarlyBird = getDistributionForPeriod(
		parsedLogs,
		distributionStarts,
		Math.min(now, earlyBirdEnds),
		bigNumberify('373357228195937860')
	)
	Object.entries(fromEarlyBird).forEach(([addr, amount]) => {
		if (
			parsedLogs.find(
				l => l.name === 'LogBond' && l.values.time.toNumber() < earlyBirdSubscriptionEnds
			)
		)
			addToMap(distribution, addr, amount)
	})

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
	const rewardChannels = db.getMongo().collection('rewardChannels')

	const channelArgs = {
		creator: DISTRIBUTION_IDENTITY,
		tokenAddr: ADXToken.address,
		tokenAmount: INCENTIVE_TO_DISTRIBUTE.toString(10),
		validUntil: DISTRIBUTION_ENDS.getTime() / 1000 + 2592000,
		validators: [adapter.whoami(), adapter.whoami()],
		spec: id(POOL_ID + DISTRIBUTION_STARTS.toString())
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
