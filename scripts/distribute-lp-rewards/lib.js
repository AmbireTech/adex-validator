/* eslint-disable no-restricted-syntax */
/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-param-reassign */
const ethers = require('ethers')

const { bigNumberify } = ethers.utils
const ZERO = bigNumberify(0)
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'
const BALANCER_ADX_YUSD_EXCHANGE_ADDRESS = '0x415900c6e18B89531e3E24C902b05c031C71A925'
const EXCLUDED_ADDRESSES = [
	'0x23C2c34f38ce66ccC10E71e9bB2A06532D52C5E9',
	'0x913bBB4c71DA6E88F90BF7e53E6b1310d75d306e'
]
const ADX_TOKEN = '0xADE00C28244d5CE17D72E40330B1c318cD12B7c3'
const DISTRIBUTION_IDENTITY = '0xe3C19038238De9bcc3E735ec4968eCd45e04c837'
const FEE_TOKEN = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
const UNISWAP_ADX_ETH_ROUTER_ADDRESS = '0xD3772A963790feDE65646cFdae08734A17cd0f47'

function addToMap(map, key, val) {
	if (!map[key]) map[key] = val
	else map[key] = map[key].add(val)
	return map
}

function getDistributionForPeriodWithMultiplier(
	distribution = {},
	parsedLogs,
	startSeconds,
	endSeconds,
	distributionPerSecond,
	parseEventLog,
	liquiditySupplyDurationByMultiplier
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
		const totalDistribution = distributionPerSecond.mul(bigNumberify(Math.floor(delta)))
		const scaledLiquidityByUser = {}
		for (const addr of Object.keys(currentLiquidityByUser)) {
			const userTime = currentLiquidityByUserTimestamp[addr]
			const multiplierDelta = Math.floor((usedEnd - userTime) / ONE_WEEK)
			const multiplier = bigNumberify(liquiditySupplyDurationByMultiplier[multiplierDelta] || 0)
			addToMap(
				scaledLiquidityByUser,
				addr,
				currentLiquidityByUser[addr].add(
					currentLiquidityByUser[addr].mul(multiplier).div(bigNumberify(100))
				)
			)
		}
		const totalStake = Object.values(scaledLiquidityByUser).reduce((a, b) => a.add(b), ZERO)
		if (totalStake.gt(ZERO)) {
			for (const addr of Object.keys(currentLiquidityByUser)) {
				addToMap(
					distribution,
					addr,
					totalDistribution.mul(scaledLiquidityByUser[addr]).div(totalStake)
				)
			}
		}
	}

	for (const log of parsedLogs) {
		tally(currentTime, log.time)
		parseEventLog(log, currentLiquidityByUser, currentLiquidityByUserTimestamp, EXCLUDED_ADDRESSES)
		currentTime = log.time
	}

	tally(currentTime, Math.floor(Date.now() / 1000))

	const periodTotalActiveStake = Object.values(currentLiquidityByUser).reduce(
		(a, b) => a.add(b),
		ZERO
	)

	return { distribution, periodTotalActiveStake }
}

function parseBalancerTransferEvents(
	log,
	currentLiquidityByUser,
	liquidityDuration,
	excludedAddresses
) {
	const { time } = log
	const { src, dst, amt } = log.values

	if (
		src !== BALANCER_ADX_YUSD_EXCHANGE_ADDRESS &&
		src !== NULL_ADDRESS &&
		!excludedAddresses.includes(src)
	) {
		currentLiquidityByUser[src] = currentLiquidityByUser[src].sub(amt)
		liquidityDuration[src] = time
	}

	if (
		dst !== BALANCER_ADX_YUSD_EXCHANGE_ADDRESS &&
		dst !== NULL_ADDRESS &&
		!excludedAddresses.includes(dst)
	) {
		addToMap(currentLiquidityByUser, dst, amt)
		liquidityDuration[dst] = time
	}
}

function parseUniswapTransferEvents(
	log,
	currentLiquidityByUser,
	liquidityDuration,
	excludedAddresses
) {
	const { time } = log
	const { from, value, to } = log.values
	if (from !== NULL_ADDRESS && !excludedAddresses.includes(from)) {
		currentLiquidityByUser[from] = currentLiquidityByUser[from].sub(value)
		liquidityDuration[from] = time
	}

	if (to !== NULL_ADDRESS && !excludedAddresses.includes(to)) {
		addToMap(currentLiquidityByUser, to, value)
		liquidityDuration[to] = time
	}
}

module.exports = {
	getDistributionForPeriodWithMultiplier,
	addToMap,
	ZERO,
	NULL_ADDRESS,
	EXCLUDED_ADDRESSES,
	parseBalancerTransferEvents,
	parseUniswapTransferEvents,
	ADX_TOKEN,
	DISTRIBUTION_IDENTITY,
	FEE_TOKEN,
	UNISWAP_ADX_ETH_ROUTER_ADDRESS,
	BALANCER_ADX_YUSD_EXCHANGE_ADDRESS
}
