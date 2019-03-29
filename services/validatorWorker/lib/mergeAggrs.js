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
	let remaining = getRemainingDepositAmount(depositAmount, balancesBeforeFees)
	let shouldCloseChannel = false

	// Merge in all the aggrs
	aggrs.forEach(function(evAggr) {
		if (evAggr.events.CLOSE_CHANNEL) {
			shouldCloseChannel = true
			return
		}
		newAccounting.lastEvAggr = new Date(
			Math.max(newAccounting.lastEvAggr.getTime(), new Date(evAggr.created).getTime())
		)
		// @TODO do something about this hardcoded event type assumption
		const result = mergePayoutsIntoBalances(
			balancesBeforeFees,
			evAggr.events.IMPRESSION,
			depositAmount
		)
		balancesBeforeFees = result.balancesBeforeFees
		remaining = result.remaining
	})

	// check if should close channel
	balancesBeforeFees = closeChannel(shouldCloseChannel, balancesBeforeFees, channel, remaining)

	newAccounting.balancesBeforeFees = toBNStringMap(balancesBeforeFees)

	// apply fees
	const balances = getBalancesAfterFeesTree(balancesBeforeFees, channel)
	newAccounting.balances = toBNStringMap(balances)
	return { balances, newAccounting }
}

function closeChannel(close, balancesBeforeFees, channel, remaining) {
	if (!close) return balancesBeforeFees

	const newBalances = { ...balancesBeforeFees }
	const { creator } = channel

	assert.ok(!remaining.isNeg(), 'remaining starts negative: total>depositAmount')

	// assign the reamining amount to the channel creator
	newBalances[creator] = remaining
	return newBalances
}

function getRemainingDepositAmount(depositAmount, balances) {
	// total of state tree balance
	const total = Object.values(balances).reduce((a, b) => a.add(b), new BN(0))
	// remaining of depositAmount
	return depositAmount.sub(total)
}

// mergePayoutsIntoBalances: pure, (balances, events, depositAmount) -> newBalances
// It does not allow the sum of all balances to exceed the depositAmount
// it will do nothing after the depositAmount is exhausted
function mergePayoutsIntoBalances(balances, events, depositAmount) {
	// new tree that will be generated
	const newBalances = { ...balances }

	if (!events) return newBalances

	let remaining = getRemainingDepositAmount(depositAmount, balances)

	assert.ok(!remaining.isNeg(), 'remaining starts negative: total>depositAmount')

	const { eventPayouts } = events
	// take the eventPayouts key
	Object.keys(eventPayouts).forEach(function(acc) {
		if (!newBalances[acc]) newBalances[acc] = new BN(0, 10)

		const eventPayout = new BN(eventPayouts[acc])
		const toAdd = BN.min(remaining, eventPayout)
		assert.ok(!toAdd.isNeg(), 'toAdd must never be negative')

		newBalances[acc] = newBalances[acc].add(toAdd)
		remaining = remaining.sub(toAdd)
		assert.ok(!remaining.isNeg(), 'remaining must never be negative')
	})
	return { balancesBeforeFees: newBalances, remaining }
}

module.exports = { mergeAggrs }
