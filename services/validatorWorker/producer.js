const assert = require('assert')
const BN = require('bn.js')
const db = require('../../db')
const cfg = require('../../cfg')
const { toBNStringMap } = require('./lib')
const { getBalancesAfterFeesTree } = require('./lib/fees')

async function tick(channel, force) {
	const eventAggrCol = db.getMongo().collection('eventAggregates')
	const stateTreeCol = db.getMongo().collection('channelStateTrees')

	const stateTree = (await stateTreeCol.findOne({ _id: channel.id })) || {
		balances: {},
		lastEvAggr: new Date(0)
	}

	// Process eventAggregates, from old to new, newer than the lastEvAggr time
	const aggrs = await eventAggrCol
		.find({
			channelId: channel.id,
			created: { $gt: stateTree.lastEvAggr }
		})
		.sort({ created: 1 })
		.limit(cfg.PRODUCER_MAX_AGGR_PER_TICK)
		.toArray()

	logMerge(channel, aggrs)

	const shouldUpdate = force || aggrs.length
	if (!shouldUpdate) {
		return { channel }
	}

	// balances should be a sum of eventPayouts
	//
	const { balancesAfterFees, newStateTree } = mergeAggrs(stateTree, aggrs, channel)

	await stateTreeCol.updateOne({ _id: channel.id }, { $set: newStateTree }, { upsert: true })

	return { channel, balancesAfterFees, newStateTree }
}

// Pure, should not mutate inputs
// @TODO isolate those pure functions into a separate file
function mergeAggrs(stateTree, aggrs, channel) {
	const newStateTree = {
		balances: {},
		balancesAfterFees: {},
		lastEvAggr: stateTree.lastEvAggr
	}
	const depositAmount = new BN(channel.depositAmount, 10)

	// Build an intermediary balances representation
	let balances = {}
	Object.keys(stateTree.balances).forEach(function(acc) {
		balances[acc] = new BN(stateTree.balances[acc], 10)
		assert.ok(!balances[acc].isNeg(), 'balance should not be negative')
	})

	// Merge in all the aggrs
	aggrs.forEach(function(evAggr) {
		newStateTree.lastEvAggr = new Date(
			Math.max(newStateTree.lastEvAggr.getTime(), evAggr.created.getTime())
		)
		// @TODO do something about this hardcoded event type assumption
		balances = mergePayoutsIntoBalances(balances, evAggr.events.IMPRESSION, depositAmount)
	})

	newStateTree.balances = toBNStringMap(balances)

	// apply fees
	const balancesAfterFees = getBalancesAfterFeesTree(balances, channel)
	newStateTree.balancesAfterFees = toBNStringMap(balancesAfterFees)

	return { balancesAfterFees, newStateTree }
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
	console.log(
		`validatorWorker: channel ${channel.id}: processing ${eventAggrs.length} event aggregates`
	)
}

module.exports = { tick }
