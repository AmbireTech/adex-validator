#!/usr/bin/env node
const tape = require('tape')

const { bigNumberify } = require('ethers').utils

const {
	getDistributionForPeriodWithMultiplier,
	NULL_ADDRESS,
	parseUniswapTransferEvents,
	parseBalancerTransferEvents
} = require('../scripts/distribute-lp-rewards/lib')

const sum = tree => Object.values(tree).reduce((a, b) => a.add(b), bigNumberify(0))

const addDays = initialDate => days => {
	const d = new Date(initialDate.toString())
	d.setDate(initialDate.getDate() + days)
	return d
}

// 2 weeks between DISTRIBUTION_START & DISTRIBUTION_ENDS
const DISTRIBUTION_START = new Date()
DISTRIBUTION_START.setDate(DISTRIBUTION_START.getDate() - 15)

const DISTRIBUTION_ENDS = new Date()
DISTRIBUTION_ENDS.setDate(DISTRIBUTION_ENDS.getDate() - 1)

const addDaysToDistributionStart = addDays(DISTRIBUTION_START)

const testBalancerTransferEvents = [
	{
		time: Math.floor(DISTRIBUTION_START.getTime() / 1000),
		values: {
			src: NULL_ADDRESS,
			amt: bigNumberify('10'),
			dst: '0x1'
		}
	},
	{
		time: Math.floor(addDaysToDistributionStart(1).getTime() / 1000),
		values: {
			src: NULL_ADDRESS,
			amt: bigNumberify('10'),
			dst: '0x2'
		}
	},
	{
		time: Math.floor(addDaysToDistributionStart(1) / 1000),
		values: {
			src: NULL_ADDRESS,
			amt: bigNumberify('10'),
			dst: '0x4'
		}
	},
	{
		time: Math.floor(addDaysToDistributionStart(7).getTime() / 1000),
		values: {
			src: NULL_ADDRESS,
			amt: bigNumberify('10'),
			dst: '0x5'
		}
	},
	{
		time: Math.floor(addDaysToDistributionStart(9).getTime() / 1000),
		values: {
			src: NULL_ADDRESS,
			amt: bigNumberify('10'),
			dst: '0x6'
		}
	},
	{
		time: Math.floor(addDaysToDistributionStart(9).getTime() / 1000),
		values: {
			src: '0x4',
			amt: bigNumberify('3'),
			dst: '0x7'
		}
	}
]

const testUniswapTransferEvents = [
	{
		time: Math.floor(DISTRIBUTION_START.getTime() / 1000),
		values: {
			from: NULL_ADDRESS,
			value: bigNumberify('10'),
			to: '0x1'
		}
	},
	{
		time: Math.floor(addDaysToDistributionStart(1).getTime() / 1000),
		values: {
			from: NULL_ADDRESS,
			value: bigNumberify('10'),
			to: '0x2'
		}
	},
	{
		time: Math.floor(addDaysToDistributionStart(1) / 1000),
		values: {
			from: NULL_ADDRESS,
			value: bigNumberify('10'),
			to: '0x4'
		}
	},
	{
		time: Math.floor(addDaysToDistributionStart(7).getTime() / 1000),
		values: {
			from: NULL_ADDRESS,
			value: bigNumberify('10'),
			to: '0x5'
		}
	},
	{
		time: Math.floor(addDaysToDistributionStart(9).getTime() / 1000),
		values: {
			from: NULL_ADDRESS,
			value: bigNumberify('10'),
			to: '0x6'
		}
	},
	{
		time: Math.floor(addDaysToDistributionStart(9).getTime() / 1000),
		values: {
			from: '0x4',
			value: bigNumberify('3'),
			to: '0x7'
		}
	}
]

const liquidityDurationByMultiplier = {
	1: 10, // 1 week => 0.1% increase
	2: 20,
	3: 30
}

const distributionStarts = Math.floor(DISTRIBUTION_START.getTime() / 1000)
const distributionEnds = Math.floor(DISTRIBUTION_ENDS.getTime() / 1000)
const distributionPerSecond = bigNumberify('10')
const totalDistribution = distributionPerSecond.mul(bigNumberify(14 * (24 * 60 * 60)))

tape('uniswap: distributes reward correctly', function(t) {
	const distribution = {}

	getDistributionForPeriodWithMultiplier(
		distribution,
		testUniswapTransferEvents,
		distributionStarts,
		distributionEnds,
		distributionPerSecond,
		parseUniswapTransferEvents,
		liquidityDurationByMultiplier
	)

	const expected = {
		'0x1': '4105529',
		'0x2': '2994304',
		'0x4': '2674304',
		'0x5': '1281860',
		'0x6': '800000',
		'0x7': '240000'
	}

	t.deepEqual(expected, toStringMap(distribution), 'should distribute reward correctly')
	t.ok(totalDistribution.gte(sum(distribution)), 'distribution does not exceed allowance')

	t.end()
})

tape('balancer: distributes reward correctly', function(t) {
	const distribution = {}
	getDistributionForPeriodWithMultiplier(
		distribution,
		testBalancerTransferEvents,
		distributionStarts,
		// Math.min(now, distributionEnds),
		// Math.floor(new Date('2020-10-21T00:00:00.000Z') / 1000),
		distributionEnds,
		distributionPerSecond,
		parseBalancerTransferEvents,
		liquidityDurationByMultiplier
	)

	const expected = {
		'0x1': '4105529',
		'0x2': '2994304',
		'0x4': '2674304',
		'0x5': '1281860',
		'0x6': '800000',
		'0x7': '240000'
	}

	t.deepEqual(expected, toStringMap(distribution), 'should distribute reward correctly')
	t.ok(totalDistribution.gte(sum(distribution)), 'distribution does not exceed allowance')

	t.end()
})

tape('balancer & uniswap: distributes reward correctly', function(t) {
	const distribution = {}
	// balancer
	getDistributionForPeriodWithMultiplier(
		distribution,
		testBalancerTransferEvents,
		distributionStarts,
		distributionEnds,
		bigNumberify('5'),
		parseBalancerTransferEvents,
		liquidityDurationByMultiplier
	)
	// uniswap
	getDistributionForPeriodWithMultiplier(
		distribution,
		testUniswapTransferEvents,
		distributionStarts,
		distributionEnds,
		bigNumberify('5'),
		parseUniswapTransferEvents,
		liquidityDurationByMultiplier
	)

	const expected = {
		'0x1': '4105528',
		'0x2': '2994304',
		'0x4': '2674304',
		'0x5': '1281860',
		'0x6': '800000',
		'0x7': '240000'
	}

	t.deepEqual(expected, toStringMap(distribution), 'should distribute reward correctly')
	t.ok(totalDistribution.gte(sum(distribution)), 'distribution does not exceed allowance')

	t.end()
})

tape('does not distribute reward after end period', function(t) {
	const distribution = {}

	getDistributionForPeriodWithMultiplier(
		distribution,
		[
			...testUniswapTransferEvents,
			{
				time: Math.floor(addDaysToDistributionStart(30).getTime() / 1000),
				values: {
					from: '0x4',
					value: bigNumberify('3200'),
					to: '0x7'
				}
			}
		],
		distributionStarts,
		distributionEnds,
		bigNumberify('10'),
		parseUniswapTransferEvents,
		liquidityDurationByMultiplier
	)

	const expected = {
		'0x1': '4105529',
		'0x2': '2994304',
		'0x4': '2674304',
		'0x5': '1281860',
		'0x6': '800000',
		'0x7': '240000'
	}
	t.deepEqual(expected, toStringMap(distribution), 'should distribute reward correctly')
	t.end()
})

function toStringMap(raw) {
	const balances = {}
	Object.entries(raw).forEach(([acc, bal]) => {
		balances[acc] = bal.toString(10)
	})
	return balances
}
