const assert = require('assert')
const BN = require('bn.js')
const { toBNStringMap, toBNMap } = require('./')
const { getBalancesAfterFeesTree } = require('./fees')

// Pure, should not mutate inputs
// mergeAggrs(accounting, aggrs, channel) -> { balances, newAccounting }
// `balances` is the same as newAccounting.balances, but a BN map
function mergeAggrs(accounting, aggrs, channel) {
	const depositAmount = new BN(channel.depositAmount, 10)
	const newAccounting = {
		type: 'Accounting',
		balancesBeforeFees: {},
		balances: {},
		lastEvAggr: new Date(accounting.lastEvAggr)
	}

	// Build an intermediary balances representation
	let balancesBeforeFees = toBNMap(accounting.balancesBeforeFees)

	// Merge in all the aggrs
	aggrs.forEach(function(evAggr) {
		newAccounting.lastEvAggr = new Date(
			Math.max(newAccounting.lastEvAggr.getTime(), new Date(evAggr.created).getTime())
		)
		balancesBeforeFees = mergePayoutsIntoBalances(balancesBeforeFees, evAggr.events, depositAmount)
	})
	newAccounting.balancesBeforeFees = toBNStringMap(balancesBeforeFees)

	// apply fees
	const balances = getBalancesAfterFeesTree(balancesBeforeFees, channel)
	newAccounting.balances = toBNStringMap(balances)

	return { balances, newAccounting }
}

// mergePayoutsIntoBalances: pure, (balances, events, depositAmount) -> newBalances
// It does not allow the sum of all balances to exceed the depositAmount
// it will do nothing after the depositAmount is exhausted
function mergePayoutsIntoBalances(balances, events, depositAmount) {
	// new tree that will be generated
	const newBalances = { ...balances }

	if (!events) return newBalances

	// total of state tree balance
	const total = Object.values(balances).reduce((a, b) => a.add(b), new BN(0))
	// remaining of depositAmount
	let remaining = depositAmount.sub(total)

	assert.ok(!remaining.isNeg(), 'remaining starts negative: total>depositAmount')

	// events is a map of type => ( eventPayouts | eventCounts ) -> acc -> amount
	const allPayouts = Object.values(events)
		.map(x => Object.entries(x.eventPayouts))
		.reduce((a, b) => a.concat(b), [])
	Object.values(allPayouts).forEach(function([acc, payout]) {
		if (!newBalances[acc]) newBalances[acc] = new BN(0, 10)

		const toAdd = BN.min(remaining, new BN(payout, 10))
		assert.ok(!toAdd.isNeg(), 'toAdd must never be negative')

		newBalances[acc] = newBalances[acc].add(toAdd)
		remaining = remaining.sub(toAdd)
		assert.ok(!remaining.isNeg(), 'remaining must never be negative')
	})
	return newBalances
}

module.exports = { mergeAggrs }
