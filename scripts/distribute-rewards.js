#!/usr/bin/env node
const assert = require('assert')
const ethers = require('ethers')

const { Contract, getDefaultProvider } = ethers
const { keccak256, defaultAbiCoder, id, bigNumberify } = ethers.utils
const fetch = require('node-fetch')
const stakingAbi = require('adex-protocol-eth/abi/Staking')
const identityAbi = require('adex-protocol-eth/abi/Identity')
const db = require('../db')
const cfg = require('../cfg')
const adapters = require('../adapters')

// Staking started on 28-12-2019
const STAKING_START_MONTH = new Date('01-01-2020')
const ADDR_STAKING = '0x46ad2d37ceaee1e82b70b867e674b903a4b4ca32'
// This is set in the staking contract
const TIME_TO_UNLOCK_SECS = 30 * 24 * 60 * 60

const FEE_DISTRIBUTION_IDENTITY = '0xe3C19038238De9bcc3E735ec4968eCd45e04c837'
const FEE_TOKEN = '0x6B175474E89094C44Da98b954EedeAC495271d0F'

const POOL_ID = id('validator:0x2892f6C41E0718eeeDd49D98D648C789668cA67d') // '0x2ce0c96383fb229d9776f33846e983a956a7d95844fac57b180ed0071d93bb28'
const POOL_VALIDATOR_URL = 'https://tom.adex.network'

const REWARD_NUM = bigNumberify(5)
const REWARD_DEN = bigNumberify(100)

const REWARD_CHANNEL_OPEN_FEE = bigNumberify('150000000000000000')

const provider = getDefaultProvider('homestead')
const Staking = new Contract(ADDR_STAKING, stakingAbi, provider)
const Identity = new Contract(FEE_DISTRIBUTION_IDENTITY, identityAbi, provider)
const Token = new Contract(
	FEE_TOKEN,
	['function balanceOf(address owner) view returns (uint)'],
	provider
)

const keystoreFile = process.argv[2]
const keystorePwd = process.env.KEYSTORE_PWD
if (!(keystoreFile && keystorePwd)) {
	console.log(`Usage: .${process.argv[1]} <path to keystore file>`)
	console.log(`KEYSTORE_PWD needs to be set in env!`)
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

function humanReadableToken(amnt) {
	return `⬙ ${(
		amnt
			// 10 ** 16
			.div(bigNumberify('0x2386f26fc10000'))
			.toNumber() / 100
	).toFixed(2)}`
}

function getNextMonth(n) {
	return n.getMonth() === 11
		? new Date(n.getFullYear() + 1, 0, 1)
		: new Date(n.getFullYear(), n.getMonth() + 1, 1)
}

function getPeriods(startDate) {
	let start = new Date(startDate)
	// Produce all periods: monthly
	const now = new Date()
	const periods = []
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
	// @TODO: filter by the ones we don't have an open channel for
	return Promise.all(
		periods.map(async ({ start, end }) => {
			// @TODO: truncate those to the proper month start if needed
			const url = `${POOL_VALIDATOR_URL}/analytics?timeframe=month&metric=eventPayouts&start=${start}&end=${end}`
			const resp = await fetch(url).then(r => r.json())
			const toDistribute = resp.aggr.map(({ value, time }) => ({
				time: new Date(time),
				value: bigNumberify(value)
					.mul(REWARD_NUM)
					.div(REWARD_DEN)
			}))
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
	// NOTE: Slashing doesn't matter into this calculation, cause we slash the whole pool together so ratios stay unchanged
	// NOTE: getLogs should not have limits
	// NOTE: poolId on LogOpen is not indexed, so we have to get everything and filter
	const logs = await provider.getLogs({ fromBlock: 0, address: ADDR_STAKING })
	const allBonds = logs.reduce((bonds, log) => {
		const topic = log.topics[0]
		const evs = Staking.interface.events
		if (topic === evs.LogBond.topic) {
			const vals = Staking.interface.parseLog(log).values
			// NOTE there's also slashedAtStart, but we do not need it cause slashing doesn't matter (whole pool gets slashed, ratios stay the same)
			const { owner, amount, poolId, nonce } = vals
			const bond = { owner, amount, poolId, nonce, openedAtBlock: log.blockNumber, end: null }
			bonds.push({
				id: getBondId(bond),
				status: 'Active',
				...bond
			})
		} else if (topic === evs.LogUnbondRequested.topic) {
			// NOTE: assuming that .find() will return something is safe, as long as the logs are properly ordered
			const { bondId, willUnlock } = Staking.interface.parseLog(log).values
			const bond = bonds.find(x => x.id === bondId)
			bond.status = 'UnbondRequested'
			bond.willUnlock = new Date(willUnlock * 1000)
			bond.end = new Date((willUnlock - TIME_TO_UNLOCK_SECS) * 1000)
		} else if (topic === evs.LogUnbonded.topic) {
			const { bondId } = Staking.interface.parseLog(log).values
			const bond = bonds.find(x => x.id === bondId)
			bond.status = 'Unbonded'
		}
		return bonds
	}, [])

	const bondsForPool = allBonds.filter(x => x.poolId === POOL_ID)

	// NOTE: Unfortunately, we don't have the proper start date, so we have to calculate it from the block
	return Promise.all(
		bondsForPool.map(async bond => {
			return {
				...bond,
				start: new Date((await provider.getBlock(bond.openedAtBlock)).timestamp * 1000)
			}
		})
	)
}

function calculateDistributionForPeriod(period, bonds) {
	const sum = (a, b) => a.add(b)
	const totalInPeriod = period.toDistribute.map(x => x.value).reduce(sum)

	const all = {}
	period.toDistribute.forEach(datapoint => {
		const activeBonds = bonds.filter(
			bond => bond.start < datapoint.time && (!bond.end || bond.end > datapoint.time)
		)
		if (!activeBonds.length) return

		const total = activeBonds.map(bond => bond.amount).reduce(sum, bigNumberify(0))
		activeBonds.forEach(bond => {
			if (!all[bond.owner]) all[bond.owner] = bigNumberify(0)
			all[bond.owner] = all[bond.owner].add(datapoint.value.mul(bond.amount).div(total))
		})
	})

	const totalDistributed = Object.values(all).reduce(sum)
	assert.ok(totalDistributed.lte(totalInPeriod), 'total distributed <= total in the period')

	return { balances: all, totalDistributed }
}

async function main() {
	await adapter.init()
	await adapter.unlock()

	// Safety check: whether we have sufficient privileges
	if ((await Identity.privileges(adapter.whoami())) < 2) {
		console.log(
			`Insufficient privilege in the distribution identity (${FEE_DISTRIBUTION_IDENTITY})`
		)
		process.exit(1)
	}

	await db.connect()
	const rewardChannels = db.getMongo().collection('rewardChannels')
	const lastChannel = (await rewardChannels
		.find()
		.sort({ validUntil: -1 })
		.limit(1))[0]
	const start = lastChannel ? getNextMonth(lastChannel.periodStart) : STAKING_START_MONTH

	const [bonds, periods] = await Promise.all([getBonds(), getPeriodsToDistributeFor(start)])

	const periodsWithDistribution = periods.map(period => ({
		...period,
		...calculateDistributionForPeriod(period, bonds)
	}))

	// Safety check: whether our funds are sufficient
	const totalAmount = periodsWithDistribution
		.map(x => x.totalDistributed)
		.reduce((a, b) => a.add(b), bigNumberify(0))
	const totalCost = totalAmount.add(REWARD_CHANNEL_OPEN_FEE)
	const available = await Token.balanceOf(FEE_DISTRIBUTION_IDENTITY)
	if (totalCost.gt(available)) {
		console.log(
			`Insufficient amount: ${humanReadableToken(available)} (${humanReadableToken(
				totalAmount
			)} needed)`
		)
		process.exit(1)
	}

	// Submit all
	// @TODO
	console.log(cfg.ETHEREUM_ADAPTER_RELAYER)

	process.exit(0)
}

main().catch(console.error)
