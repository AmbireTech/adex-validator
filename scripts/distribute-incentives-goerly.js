#!/usr/bin/env node
/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-param-reassign */
// const assert = require('assert')
const ethers = require('ethers')

const { Contract, getDefaultProvider } = ethers
const { keccak256, defaultAbiCoder, bigNumberify, hexlify, Interface, id } = ethers.utils
const fetch = require('node-fetch')
const { Channel, Transaction, MerkleTree, splitSig } = require('adex-protocol-eth/js')
const stakingAbi = require('adex-protocol-eth/abi/Staking')
const identityAbi = require('adex-protocol-eth/abi/Identity')
const COREAbi = require('adex-protocol-eth/abi/AdExCore.json')
const erc20AIB = require('./erc20abi.json')

const db = require('../db')
const cfg = require('../cfg')
const adapters = require('../adapters')

const ADDR_STAKING = '0xA83675086d99ef52ac78EDd534059C0Ae7f504f4'

const DISTRIBUTION_IDENTITY = '0x99D162298ffC4ECd949BF574c2959130c8d2D8f8'
const ADX_TOKEN = '0x6170ea3629a1E49B77EEd0e0A18460ac184CA71e'
const FEE_TOKEN = '0x7af963cF6D228E564e2A0aA0DdBF06210B38615D'
const DISTRIBUTION_STARTS = new Date('2020-12-29T00:00:00.000Z')
const DISTRIBUTION_ENDS = new Date('2021-03-31T00:00:00.000Z')
const DISTRIBUTION_SECONDS = (DISTRIBUTION_ENDS.getTime() - DISTRIBUTION_STARTS.getTime()) / 1000
const CHANNEL_VALIDITY = 350 * 24 * 60 * 60
const POOL_ID = id('validator:0x2892f6C41E0718eeeDd49D98D648C789668cA67d') // '0x2ce0c96383fb229d9776f33846e983a956a7d95844fac57b180ed0071d93bb28'

if ((DISTRIBUTION_ENDS.getTime() - DISTRIBUTION_STARTS.getTime()) / 1000 > CHANNEL_VALIDITY / 2) {
	throw new Error('distribution lasts for longer than channel validity times two')
}

const INCENTIVE_CHANNEL_OPEN_FEE = bigNumberify('1500000000000000000')
const INCENTIVE_TO_DISTRIBUTE = bigNumberify('5000000000000000000000000')
const DISTRIBUTION_REWARDS_PER_SECOND = INCENTIVE_TO_DISTRIBUTE.div(DISTRIBUTION_SECONDS).toString(
	10
)

if (DISTRIBUTION_REWARDS_PER_SECOND !== '629025764895330112') throw new Error('rate miscalc?')

const provider = getDefaultProvider('goerli')
const Staking = new Contract(ADDR_STAKING, stakingAbi, provider)
const Identity = new Contract(DISTRIBUTION_IDENTITY, identityAbi, provider)
const ADXToken = new Contract(ADX_TOKEN, erc20AIB, provider)
const ADXTokenInterface = new Interface(erc20AIB)
// const idInterface = new Interface(identityAbi)

const coreAddr = cfg.ETHEREUM_CORE_ADDR
const coreInterface = new Interface(COREAbi)

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
			addToMap(
				distribution,
				addr,
				totalStake.isZero()
					? ZERO
					: totalDistribution.mul(currentStakedByUser[addr]).div(totalStake)
			)
		}
	}

	for (const log of parsedLogs) {
		tally(currentTime, log.values.time.toNumber())

		if (log.name === 'LogBond') {
			addToMap(currentStakedByUser, log.values.owner, log.values.amount)
			bonds[getBondId(log.values)] = log.values
		}
		if (
			(log.name === 'LogUnbondRequested' || log.name === 'LogUnbonded') &&
			bonds[log.values.bondId]
		) {
			currentStakedByUser[log.values.owner] = currentStakedByUser[log.values.owner].sub(
				bonds[log.values.bondId].amount
			)
			delete bonds[log.values.bondId]
		}
		currentTime = log.values.time.toNumber()
	}
	tally(currentTime, endSeconds)

	const periodTotalActiveStake = Object.values(currentStakedByUser).reduce((a, b) => a.add(b), ZERO)

	return { distribution, periodTotalActiveStake }
}

async function calculateTotalDistribution() {
	// From infura's docs: https://infura.io/docs/ethereum/json-rpc/eth-getLogs
	// A max of 10,000 results can be returned by a single query
	const logs = await provider.getLogs({ fromBlock: 0, address: ADDR_STAKING })
	if (logs.length >= 10000)
		throw new Error('max limit of getLogs reached; we must reimplement the way we get logs')

	const parsedLogs = logs.map(log => Staking.interface.parseLog(log))
	const now = Math.floor(Date.now() / 1000)
	const distributionStarts = DISTRIBUTION_STARTS.getTime() / 1000
	const distributionEnds = DISTRIBUTION_ENDS.getTime() / 1000
	const distributionRewardPerSecond = DISTRIBUTION_REWARDS_PER_SECOND

	const { distribution, periodTotalActiveStake } = getDistributionForPeriod(
		parsedLogs,
		distributionStarts,
		Math.min(now, distributionEnds),
		bigNumberify(distributionRewardPerSecond)
	)

	return {
		distribution,
		currentTotalActiveStake: periodTotalActiveStake.toString(),
		currentRewardPerSecond: distributionRewardPerSecond
	}
}

async function main() {
	console.log(`Distribution identity: ${DISTRIBUTION_IDENTITY}`)

	await adapter.init()
	await adapter.unlock()

	console.log(await Identity.privileges(adapter.whoami()))

	// Safety check: whether we have sufficient privileges
	if ((await Identity.privileges(adapter.whoami())) < 2) {
		console.log(`Insufficient privilege in the distribution identity (${DISTRIBUTION_IDENTITY})`)
		process.exit(1)
	}

	const {
		distribution,
		currentTotalActiveStake,
		currentRewardPerSecond
	} = await calculateTotalDistribution()
	const distributed = Object.values(distribution).reduce((a, b) => a.add(b), ZERO)
	if (distributed.gt(INCENTIVE_TO_DISTRIBUTE)) {
		console.error('Fatal error: calculated amount to distribute is more than the intended maximum!')
		process.exit(1)
	}

	console.log('distribution', distribution)

	await db.connect()
	const rewardChannels = db.getMongo().collection('rewardChannels')

	const channelArgs = {
		creator: DISTRIBUTION_IDENTITY,
		tokenAddr: ADXToken.address,
		tokenAmount: INCENTIVE_TO_DISTRIBUTE.toString(10),
		validUntil: DISTRIBUTION_STARTS.getTime() / 1000 + CHANNEL_VALIDITY,
		validators: [adapter.whoami(), adapter.whoami()],
		// we can just use new formula: POOL_ID + DISTRIBUTION_STARTS.getTime()
		// prev spec used .toString() instead of .getTime() but that is dependent on timezone
		spec: id(POOL_ID + DISTRIBUTION_STARTS.getTime())
	}
	const channel = new Channel({
		...channelArgs,
		spec: Buffer.from(channelArgs.spec.slice(2), 'hex')
	})
	const channelId = channel.hashHex(coreAddr)

	if (!(await rewardChannels.countDocuments({ channelId }))) {
		console.log('Channel does not exist, opening...')
		const allowance = await ADXToken.allowance(DISTRIBUTION_IDENTITY, coreAddr)

		const txnsRaw = []
		const signatures = []

		let nonce = (await Identity.nonce()).toNumber()

		if (allowance.isZero()) {
			const approveTxRaw = {
				identityContract: DISTRIBUTION_IDENTITY,
				nonce,
				feeTokenAddr: FEE_TOKEN,
				feeAmount: INCENTIVE_CHANNEL_OPEN_FEE.toString(10),
				to: ADX_TOKEN,
				data: hexlify(
					ADXTokenInterface.functions.approve.encode([
						coreAddr,
						bigNumberify(
							'115792089237316195423570985008687907853269984665640564039457584007913129639935'
						)
					])
				)
			}
			txnsRaw.push(approveTxRaw)

			nonce += 1

			const approveTx = new Transaction(approveTxRaw)
			const approveSig = splitSig(await adapter.sign(approveTx.hash()))

			signatures.push(approveSig)
		}

		// Open the channel
		// identity V2 (no channelOpen)
		const openTxRaw = {
			identityContract: DISTRIBUTION_IDENTITY,
			nonce,
			feeTokenAddr: FEE_TOKEN,
			feeAmount: INCENTIVE_CHANNEL_OPEN_FEE.toString(10),
			to: coreAddr,
			data: hexlify(coreInterface.functions.channelOpen.encode([channel.toSolidityTuple()]))
		}
		const openTx = new Transaction(openTxRaw)
		const txSig = splitSig(await adapter.sign(openTx.hash()))

		txnsRaw.push(openTxRaw)
		signatures.push(txSig)
		await relayerPost(`/identity/${DISTRIBUTION_IDENTITY}/execute`, {
			signatures,
			txnsRaw
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
			currentRewardPerSecond,
			currentTotalActiveStake,
			poolId: POOL_ID
		}
	}

	console.log('rewardRecord', rewardRecord)
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
