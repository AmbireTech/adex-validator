const { throttle } = require('throttle-debounce')
const db = require('../../db')

const AGGREGATION_THROTTLE = 30*1000

const recorders = {}

function record(channelId, userId, events) {
	if (!recorders[channelId]) {
		recorders[channelId] = makeRecorder(channelId)
	}

	recorders[channelId](userId, events)
	return Promise.resolve()
}

function makeRecorder(channelId) {
	const newObject = () => { return { channelId, created: new Date(), events: {} } }
	const eventAggrCol = db.getMongo().collection('eventAggregates')

	// persist
	//const saveQueue = []
	const persist = function(toSave) {
		// @TODO: proper, one-at-a-time queue
		eventAggrCol.insertOne(toSave)
		.catch(function(err) {
			console.error('eventAggregator fatal error', err)
		})
	}

	// persist and reset
	let o = newObject()
	const persistAndReset = function() {
		const toSave = o
		// this has to be flushed immediately cause otherwise we will drop
		// everything received while we're sending
		o = newObject()
		logAggregate(toSave)
		// to ensure we always persist toSave's, we have a separate queue
		persist(toSave)
	}
	// @TODO: can this be made to be trailing, not leading?
	const throttledPersistAndReset = throttle(AGGREGATION_THROTTLE, persistAndReset)

	return function(userId, events) {
		// @TODO only certain events are recognized, so ev.type should be from a whitelist
		events.forEach(function(ev) {
			if (!o.events[ev.type]) o.events[ev.type] = {}
			if (!o.events[ev.type][userId]) o.events[ev.type][userId] = 0
			o.events[ev.type][userId]++
		})
		throttledPersistAndReset()
	}
}

function logAggregate(o) {
	// @TODO: optional
	console.log(`Event aggregate produced, events for ${Object.keys(o.events).length} users`)
}

module.exports = { record }
