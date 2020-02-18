#!/usr/bin/env node
const ethers = require('ethers')

const { Contract, getDefaultProvider } = ethers
const { keccak256, defaultAbiCoder } = ethers.utils
const BN = require('bn.js')
const fetch = require('node-fetch')
const STAKING_ABI = require('adex-protocol-eth/abi/Staking')
const cfg = require('../cfg')

// Staking started on 28-12-2019
const STAKING_START_MONTH = new Date('01-01-2020')
const ADDR_STAKING = '0x46ad2d37ceaee1e82b70b867e674b903a4b4ca32'

// const POOL_ID = '0x2ce0c96383fb229d9776f33846e983a956a7d95844fac57b180ed0071d93bb28'
const POOL_VALIDATOR_URL = 'https://tom.adex.network'

const REWARD_NUM = new BN(5)
const REWARD_DEN = new BN(100)

const provider = getDefaultProvider('homestead')
const Staking = new Contract(ADDR_STAKING, STAKING_ABI, provider)

// Not needed if we simply get the revenue of feeAddr
// maybe just the whole fee + minimum "base"

// consider using the adapter for opening the keystore
// we just need to sign technically, so it should be good!

// also we'll use the sentryUrl to get stats

// cfg relayer would also be useful
console.log(cfg.ETHEREUM_ADAPTER_RELAYER)

function getPeriods(startDate) {
	let start = new Date(startDate)
	// Produce all periods: monthly
	const getNextMonth = n =>
		n.getMonth() === 11
			? new Date(n.getFullYear() + 1, 0, 1)
			: new Date(n.getFullYear(), n.getMonth() + 1, 1)
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
				time,
				value: new BN(value).mul(REWARD_NUM).div(REWARD_DEN)
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
	// @TODO: ensure this has no limits
	// @TODO remind yourself of how slashing work, see if relevant; I think not cause the whole pool will be slashed, so only the amount matters
	// @TODO only this pool ID
	const logs = await provider.getLogs({ fromBlock: 0, address: ADDR_STAKING })
	return logs.reduce((bonds, log) => {
		const topic = log.topics[0]
		const evs = Staking.interface.events
		if (topic === evs.LogBond.topic) {
			const vals = Staking.interface.parseLog(log).values
			// @TODO there's also slashedAtStart, do we use it?
			const { owner, amount, poolId, nonce } = vals
			const bond = { owner, amount, poolId, nonce }
			bonds.push({
				id: getBondId(bond),
				status: 'Active',
				...bond
			})
		} else if (topic === evs.LogUnbondRequested.topic) {
			// NOTE: assuming that .find() will return something is safe, as long as the logs are properly ordered
			const { bondId, willUnlock } = Staking.interface.parseLog(log).values
			const bond = bonds.find(({ id }) => id === bondId)
			bond.status = 'UnbondRequested'
			bond.willUnlock = new Date(willUnlock * 1000)
		} else if (topic === evs.LogUnbonded.topic) {
			// @TODO add Unbonded date (block number?)
			const { bondId } = Staking.interface.parseLog(log).values
			// eslint-disable-next-line no-param-reassign
			bonds.find(({ id }) => id === bondId).status = 'Unbonded'
		}
		return bonds
	}, [])
}

async function main() {
	// @TODO parallel
	const bonds = await getBonds()
	console.log(bonds)
	const periods = await getPeriodsToDistributeFor(STAKING_START_MONTH)
	console.log(
		periods[0].toDistribute
			.map(x => x.value)
			.reduce((a, b) => a.add(b))
			.toString(10)
	)
}

main().catch(console.error)
