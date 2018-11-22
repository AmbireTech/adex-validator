const db = require('../../db')

const MAX_PER_TICK = 100

// @TODO: keep the latest state (or get it from the db), reap unprocessed eventAggregates from oldest to newest; then in 1 atomic process, mark them as reaped and write the new state
function tick(channel) {
	const eventAggrCol = db.getMongo().collection('eventAggregates')
	const stateTreeCol = db.getMongo().collection('channelStateTrees')

	return stateTreeCol.findOne({ _id: channel._id })
	.then(function(stateTree) {
		return stateTree || { balances: {} }
	})
	.then(function(stateTree) {
		eventAggrCol.find({ channelId: channel._id, reaped: { $ne: true } })
		.limit(MAX_PER_TICK)
		.toArray()
		.then(function(aggrs) {
			logReap(channel, aggrs)
			console.log(stateTree, aggrs)
		})
	})
	// @TODO obtain channel ctx, state, and payment info
	// @TODO get the previous state
}

function logReap(channel, eventAggrs) {
	// @TODO optional
	console.log(`Channel ${channel._id}: processing ${eventAggrs.length} event aggregates`)
}

module.exports = { tick }
