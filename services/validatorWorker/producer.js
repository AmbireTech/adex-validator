const assert = require('assert')
const BN = require('bn.js')
const db = require('../../db')
const cfg = require('../../cfg')

function tick(channel, force) {
	const eventAggrCol = db.getMongo().collection('eventAggregates')
	const stateTreeCol = db.getMongo().collection('channelStateTrees')

	return stateTreeCol.findOne({ _id: channel.id })
	.then(function(stateTree) {
		return stateTree || { balances: {}, lastEvAggr: new Date(0) }
	})
	.then(function(stateTree) {
		// hasNoPrevStateTree is used in order to make the system produce a NewState on each channel we find for the first time
		const hasNoPrevStateTree = !stateTree._id
		// Process eventAggregates, from old to new, newer than the lastEvAggr time
		return eventAggrCol.find({
			channelId: channel.id,
			created: { $gt: stateTree.lastEvAggr }
		})
		.sort({ created: 1 })
		.limit(cfg.PRODUCER_MAX_AGGR_PER_TICK)
		.toArray()
		.then(function(aggrs) {
			logMerge(channel, aggrs)

			const shouldUpdate = force || aggrs.length
			if (!shouldUpdate) {
				return { channel, hasNoPrevStateTree }
			}

			const { balances, newStateTree } = mergeAggrs(
				stateTree,
				aggrs,
				// @TODO obtain channel payment info
				{ amount: new BN(1), depositAmount: new BN(channel.depositAmount) }
			)

			return stateTreeCol
			.updateOne(
				{ _id: channel.id },
				{ $set: newStateTree },
				{ upsert: true }
			)
			.then(function() {
				return { channel, balances, hasNoPrevStateTree, newStateTree }
			})
		})
	})
}

// Pure, should not mutate inputs
// @TODO isolate those pure functions into a separate file
function mergeAggrs(stateTree, aggrs, paymentInfo) {
	const newStateTree = { balances: {}, lastEvAggr: stateTree.lastEvAggr }

	// Build an intermediary balances representation
	const balances = {}
	Object.keys(stateTree.balances).forEach(function(acc) {
		balances[acc] = new BN(stateTree.balances[acc], 10)
		assert.ok(!balances[acc].isNeg(), 'balance should not be negative')
	})

	// Merge in all the aggrs
	aggrs.forEach(function(evAggr) {
		newStateTree.lastEvAggr = new Date(Math.max(
			newStateTree.lastEvAggr.getTime(),
			evAggr.created.getTime()
		))

		// @TODO do something about this hardcoded event type assumption
		mergePayableIntoBalances(balances, evAggr.events.IMPRESSION, paymentInfo)
	})

	// Rewrite into the newStateTree
	Object.keys(balances).forEach(function(acc) {
		newStateTree.balances[acc] = balances[acc].toString(10)
	})

	return { balances, newStateTree }
}

// Mutates the balances input
// For now, this just disregards anything that goes over the depositAmount
function mergePayableIntoBalances(balances, events, paymentInfo) {
	if (!events) return
	// @TODO use BN for the events
	const total = Object.values(balances).reduce((a, b) => a.add(b), new BN(0))
	let remaining = paymentInfo.depositAmount.sub(total)
	assert.ok(!remaining.isNeg(), 'remaining starts negative: total>depositAmount')
	Object.keys(events).forEach(function(acc) {
		if (!balances[acc]) balances[acc] = new BN(0, 10)
		const eventCount = new BN(events[acc])
		const toAdd = BN.min(remaining, eventCount.mul(paymentInfo.amount))
		assert.ok(!toAdd.isNeg(), 'toAdd must never be negative')
		balances[acc] = balances[acc].add(toAdd)
		remaining = remaining.sub(toAdd)

		assert.ok(!remaining.isNeg(), 'remaining must never be negative')
	})
}

function logMerge(channel, eventAggrs) {
	if (eventAggrs.length === 0) return
	console.log(`validatorWorker: channel ${channel.id}: processing ${eventAggrs.length} event aggregates`)
}

module.exports = { tick }
