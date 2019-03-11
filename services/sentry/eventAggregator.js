const throttle = require('lodash.throttle')
const db = require('../../db')
const cfg = require('../../cfg')
const eventReducer = require('./lib/eventReducer')

const recorders = new Map()

function record(channel, userId, events) {
	const { id } = channel
	
	if (!recorders.has(id)) {
		recorders.set(id, makeRecorder(id))
	}

	recorders.get(id)(userId, events, channel)
	return Promise.resolve()
}

function makeRecorder(channelId) {
	const eventAggrCol = db.getMongo().collection('eventAggregates')

	// persist each individual aggregate
	// this is done in a one-at-a-time queue, with re-trying, to ensure everything is saved
	// @TODO figure out if this will leak memory (cause of the long promise chain we are creating)
	let saveQueue = Promise.resolve()
	const persist = function(toSave) {
		saveQueue = saveQueue.then(function() {
			return eventAggrCol.insertOne(toSave)
			.catch(function(err) {
				console.error('sentry: eventAggregator fatal error; will re-try', err)
				persist(toSave)
			})
		})
	}

	// persist and reset
	let aggr = eventReducer.newAggr(channelId)
	const persistAndReset = function() {
		const toSave = aggr
		// do not change the order of operations here
		// aggr needs to be reset immediately after toSave = aggr, otherwise we will lose data
		// cause persist() will copy the object while we're still using it to save stuff
		aggr = eventReducer.newAggr(channelId)

		logAggregate(channelId, toSave)
		// to ensure we always persist toSave's, we have a separate queue
		persist(toSave)
	}
	const throttledPersistAndReset = throttle(persistAndReset, cfg.AGGR_THROTTLE, { leading: false, trailing: true })

	return function(userId, events, channel) {
		aggr = events.reduce(eventReducer.reduce.bind(null, userId, channel), aggr)
		throttledPersistAndReset()
	}
}

function logAggregate(channelId, aggr) {
	console.log(`sentry: channel ${channelId}: event aggregate produced`)
}

module.exports = { record }
