#!/usr/bin/env node
/* eslint-disable no-console */
const assert = require('assert')
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

const STAKING_START_MONTH = new Date('01-01-2020')
const ADDR_STAKING = '0x4846c6837ec670bbd1f5b485471c8f64ecb9c534'
const MAX_SLASH = bigNumberify('1000000000000000000')

const DISTRIBUTION_IDENTITY = '0xe3C19038238De9bcc3E735ec4968eCd45e04c837'
const FEE_TOKEN = '0x6B175474E89094C44Da98b954EedeAC495271d0F'

const POOL_ID = id('validator:0x2892f6C41E0718eeeDd49D98D648C789668cA67d') // '0x2ce0c96383fb229d9776f33846e983a956a7d95844fac57b180ed0071d93bb28'
const POOL_VALIDATOR_URL = 'https://tom.adex.network'

const REWARD_NUM = bigNumberify(7)
const REWARD_DEN = bigNumberify(100)

const REWARD_CHANNEL_OPEN_FEE = bigNumberify('1500000000000000000')

const provider = getDefaultProvider('homestead')
const Staking = new Contract(ADDR_STAKING, stakingAbi, provider)
const Identity = new Contract(DISTRIBUTION_IDENTITY, identityAbi, provider)
const Token = new Contract(
	FEE_TOKEN,
	['function balanceOf(address owner) view returns (uint)'],
	provider
)
const idInterface = new Interface(identityAbi)

const coreAddr = cfg.ETHEREUM_CORE_ADDR

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

function humanReadableToken(amnt) {
	return `⬙ ${(
		amnt
			// 10 ** 16
			.div(bigNumberify('0x2386f26fc10000'))
			.toNumber() / 100
	).toFixed(2)}`
}

function getNextMonth(n) {
	return new Date(
		n.getMonth() === 11
			? Date.UTC(n.getFullYear() + 1, 0, 1)
			: Date.UTC(n.getFullYear(), n.getMonth() + 1, 1)
	)
}

function getPeriods(startDate) {
	let start = new Date(startDate)
	// Produce all periods: monthly
	const now = new Date()
	const periods = []
	// eslint-disable-next-line no-constant-condition
	while (true) {
		// Current month is not over, so it's not included
		if (start.getFullYear() === now.getFullYear() && start.getMonth() === now.getMonth()) break
		const next = getNextMonth(start)
		periods.push({ start, end: next })
		start = next
	}

	return periods
}

async function getPeriodsToDistributeFor(startDate) {
	const periods = getPeriods(startDate)
	return Promise.all(
		periods.map(async ({ start, end }) => {
			const url = `${POOL_VALIDATOR_URL}/analytics?timeframe=month&metric=eventPayouts&start=${start}&end=${end}`
			const resp = await fetch(url).then(r => r.json())
			const toDistribute = resp.aggr.map(({ value, time }, i) => {
				const zero = bigNumberify(0)
				const val = bigNumberify(value)
					.mul(REWARD_NUM)
					.div(REWARD_DEN)
					// Adjust this to remove the channelOpen fee from the monthly turnover
					.sub(i === 0 ? REWARD_CHANNEL_OPEN_FEE : zero)
				assert.ok(val.gte(zero))
				return {
					time: new Date(time),
					value: val
				}
			})
			return { start, end, toDistribute }
		})
	)
}

function getBondId({ owner, amount, poolId, nonce }) {
	return keccak256(
		defaultAbiCoder.encode(
			['address', 'address', 'uint', 'bytes32', 'uint'],
			[ADDR_STAKING, owner, amount, poolId, nonce]
		)
	)
}

async function getBonds() {
	// NOTE: getLogs should not have limits
	// NOTE: poolId on LogOpen is not indexed, so we have to get everything and filter
	const logs = await provider.getLogs({ fromBlock: 0, address: ADDR_STAKING })
	const allBonds = logs.reduce((bonds, log) => {
		const topic = log.topics[0]
		const evs = Staking.interface.events
		if (topic === evs.LogBond.topic) {
			const vals = Staking.interface.parseLog(log).values
			// NOTE there's also slashedAtStart, but we do not need it cause slashing doesn't matter (whole pool gets slashed, ratios stay the same)
			const { owner, amount, poolId, nonce, slashedAtStart, time } = vals
			const bond = {
				owner,
				amount,
				poolId,
				nonce,
				slashedAtStart,
				openedAtBlock: log.blockNumber,
				start: time,
				end: null
			}
			bonds.push({
				id: getBondId(bond),
				status: 'Active',
				...bond
			})
		} else if (topic === evs.LogUnbondRequested.topic) {
			// NOTE: assuming that .find() will return something is safe, as long as the logs are properly ordered
			const { bondId, willUnlock, time } = Staking.interface.parseLog(log).values
			const bond = bonds.find(x => x.id === bondId)
			bond.status = 'UnbondRequested'
			bond.willUnlock = new Date(willUnlock * 1000)
			bond.end = new Date(time * 1000)
		} else if (topic === evs.LogUnbonded.topic) {
			const { bondId } = Staking.interface.parseLog(log).values
			const bond = bonds.find(x => x.id === bondId)
			bond.status = 'Unbonded'
		}
		return bonds
	}, [])

	return allBonds.filter(x => x.poolId === POOL_ID)
}

async function getSlashes() {
	const evs = Staking.interface.events
	const logs = await provider.getLogs({
		fromBlock: 0,
		address: ADDR_STAKING,
		topics: [evs.LogSlash.topic, POOL_ID]
	})
	return Promise.all(
		logs.map(async log => {
			return {
				slashPts: Staking.interface.parseLog(log).newSlashPts,
				time: new Date((await provider.getBlock(log.blockNumber)).timestamp * 1000)
			}
		})
	)
}

function calculateDistributionForPeriod(period, bonds, slashes) {
	const sum = (a, b) => a.add(b)
	const totalInPeriod = period.toDistribute.map(x => x.value).reduce(sum)

	const all = {}
	const activeBondsByDataPoint = {}
	period.toDistribute.forEach(datapoint => {
		const slashEv = [...slashes].reverse().find(x => datapoint.time > x.time)
		const slashPts = slashEv ? slashEv.slashPts : bigNumberify(0)

		const activeBonds = bonds.filter(
			bond => bond.start < datapoint.time && (!bond.end || bond.end > datapoint.time)
		)
		if (!activeBonds.length) return

		const activeBondAmounts = activeBonds.map(bond => ({
			effectiveAmount: bond.amount
				.mul(MAX_SLASH.sub(slashPts))
				.div(MAX_SLASH.sub(bond.slashedAtStart)),
			owner: bond.owner
		}))
		const total = activeBondAmounts.map(bond => bond.effectiveAmount).reduce(sum, bigNumberify(0))
		activeBondAmounts.forEach(bond => {
			if (!all[bond.owner]) all[bond.owner] = bigNumberify(0)
			all[bond.owner] = all[bond.owner].add(datapoint.value.mul(bond.effectiveAmount).div(total))
		})
		activeBondsByDataPoint[datapoint.time] = total
	})

	const totalDistributed = Object.values(all).reduce(sum, bigNumberify(0))
	assert.ok(totalDistributed.lte(totalInPeriod), 'total distributed <= total in the period')
	const periodTotalActiveStake = Object.values(activeBondsByDataPoint).reduce(
		(a, b) => a.add(b),
		bigNumberify(0)
	)

	return { balances: all, totalDistributed, periodTotalActiveStake }
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

	await db.connect()
	const rewardChannels = db.getMongo().collection('rewardChannels')
	const lastChannel = (await rewardChannels
		.find({ 'channelArgs.tokenAddr': FEE_TOKEN })
		.sort({ periodStart: -1 })
		.limit(1)
		.toArray())[0]
	const start = lastChannel ? getNextMonth(lastChannel.periodStart) : STAKING_START_MONTH

	const [slashes, bonds, periods] = await Promise.all([
		getSlashes(),
		getBonds(),
		getPeriodsToDistributeFor(start)
	])
	if (periods.length === 0) {
		console.log('Nothing to do!')
		process.exit(0)
	}

	const periodsWithDistribution = periods.map(period => ({
		...period,
		...calculateDistributionForPeriod(period, bonds, slashes)
	}))

	// Safety check: whether our funds are sufficient
	const totalAmount = periodsWithDistribution
		.map(x => x.totalDistributed)
		.reduce((a, b) => a.add(b), bigNumberify(0))
	const totalCost = totalAmount.add(REWARD_CHANNEL_OPEN_FEE)
	const available = await Token.balanceOf(DISTRIBUTION_IDENTITY)
	if (totalCost.gt(available)) {
		console.log(
			`Insufficient amount in the distribution identity: ${humanReadableToken(available)}` +
				` (${humanReadableToken(totalAmount)} needed)`
		)
		process.exit(1)
	}

	// Submit all
	/* eslint-disable no-await-in-loop */
	/* eslint-disable no-restricted-syntax */
	for (const period of periodsWithDistribution) {
		const channelArgs = {
			creator: DISTRIBUTION_IDENTITY,
			tokenAddr: Token.address,
			tokenAmount: period.totalDistributed.toString(10),
			validUntil: Math.floor(period.start.getTime() / 1000) + 365 * 24 * 60 * 60,
			validators: [adapter.whoami(), adapter.whoami()],
			spec: id(POOL_ID + period.start.toString())
		}
		const channel = new Channel({
			...channelArgs,
			spec: Buffer.from(channelArgs.spec.slice(2), 'hex')
		})
		const channelId = channel.hashHex(coreAddr)

		// Prepare for opening the channel
		const openTxRaw = {
			identityContract: DISTRIBUTION_IDENTITY,
			nonce: (await Identity.nonce()).toNumber(),
			feeTokenAddr: Token.address,
			feeAmount: REWARD_CHANNEL_OPEN_FEE.toString(10),
			// We are calling the channelOpen() on the Identity itself, which calls the Core
			to: DISTRIBUTION_IDENTITY,
			data: hexlify(idInterface.functions.channelOpen.encode([coreAddr, channel.toSolidityTuple()]))
		}
		const openTx = new Transaction(openTxRaw)
		const txSig = splitSig(await adapter.sign(openTx.hash()))
		await relayerPost(`/identity/${DISTRIBUTION_IDENTITY}/execute`, {
			signatures: [txSig],
			txnsRaw: [openTxRaw]
		})

		// Prepare the balance tree and signatures that will grant the ability to withdraw
		const tree = new MerkleTree(
			Object.entries(period.balances).map(([addr, value]) =>
				Channel.getBalanceLeaf(addr, value.toString(10))
			)
		)
		const stateRoot = tree.getRoot()
		const hashToSign = channel.hashToSign(coreAddr, stateRoot)
		const balancesSig = splitSig(await adapter.sign(hashToSign))
		const periodStart = period.start
		const periodEnd = period.end

		// The record that we are going to be saving in the DB
		const rewardRecord = {
			_id: channelId,
			channelId,
			channelArgs,
			balances: Object.fromEntries(
				Object.entries(period.balances).map(([addr, value]) => [addr, value.toString(10)])
			),
			// The same validator is assigned for both slots
			signatures: [balancesSig, balancesSig],
			periodStart,
			periodEnd,
			stats: {
				currentTotalActiveStake: period.periodTotalActiveStake.toString(10),
				poolId: POOL_ID
			}
		}
		await rewardChannels.insertOne(rewardRecord)

		console.log(
			`Channel ${channelId} created, reward record created, total distributed: ${humanReadableToken(
				period.totalDistributed
			)}`
		)
	}

	process.exit(0)
}

main().catch(e => {
	console.error(e)
	process.exit(1)
})
