const assert = require('assert')
const BN = require('bn.js')
const { toBNStringMap, toBNMap } = require('./lib')
const { getBalancesAfterFeesTree } = require('./lib/fees')

async function tick(iface, channel) {
	const accounting = (await iface.getOurLatestMsg('Accounting')) || {
		balancesBeforeFees: {},
		balances: {},
		lastEvAggr: new Date(0)
	}

	// Process eventAggregates, from old to new, newer than the lastEvAggr time
	const aggrs = await iface.getEventAggrs({ after: accounting.lastEvAggr })

	logMerge(channel, aggrs)

	// mergeAggr will add all eventPayouts from aggrs to the balancesBeforeFees
	// and produce a new accounting message
	const { balances, newAccounting } = mergeAggrs(accounting, aggrs, channel)
	if (aggrs.length) await iface.propagate([newAccounting])
	return { balances, newAccounting }
}

// Pure, should not mutate inputs
// @TODO isolate those pure functions into a separate file
function mergeAggrs(accounting, aggrs, channel) {
	const newAccounting = {
		type: 'Accounting',
		balancesBeforeFees: {},
		balances: {},
		lastEvAggr: new Date(accounting.lastEvAggr)
	}
	const depositAmount = new BN(channel.depositAmount, 10)

	// Build an intermediary balances representation
	let balancesBeforeFees = toBNMap(accounting.balancesBeforeFees)

	// Merge in all the aggrs
	aggrs.forEach(function(evAggr) {
		newAccounting.lastEvAggr = new Date(
			Math.max(newAccounting.lastEvAggr.getTime(), new Date(evAggr.created).getTime())
		)
		// @TODO do something about this hardcoded event type assumption
		balancesBeforeFees = mergePayoutsIntoBalances(
			balancesBeforeFees,
			evAggr.events.IMPRESSION,
			depositAmount
		)
	})
	newAccounting.balancesBeforeFees = toBNStringMap(balancesBeforeFees)

	// apply fees
	const balances = getBalancesAfterFeesTree(balancesBeforeFees, channel)
	newAccounting.balances = toBNStringMap(balances)

	return { balances, newAccounting }
}

// Mutates the balances input
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
	return newBalances
}

function logMerge(channel, eventAggrs) {
	if (eventAggrs.length === 0) return
	// eslint-disable-next-line no-console
	console.log(
		`validatorWorker: channel ${channel.id}: processing ${eventAggrs.length} event aggregates`
	)
}

module.exports = { tick }
