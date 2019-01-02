const throttle = require('lodash.throttle')
const db = require('../../db')
const cfg = require('../../cfg')

const recorders = {}

function record(channelId, userId, events) {
	if (!recorders[channelId]) {
		recorders[channelId] = makeRecorder(channelId)
	}

	recorders[channelId](userId, events)
	return Promise.resolve()
}

function makeRecorder(channelId) {
	const newObject = () => ({ channelId, created: new Date(), events: {} })
	const eventAggrCol = db.getMongo().collection('eventAggregates')

	// persist each individual aggregate
	// this is done in a one-at-a-time queue, with re-trying, to ensure everything is saved
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
	let o = newObject()
	const persistAndReset = function() {
		const toSave = o
		// this has to be flushed immediately cause otherwise we will drop
		// everything received while we're sending
		o = newObject()
		logAggregate(channelId, toSave)
		// to ensure we always persist toSave's, we have a separate queue
		persist(toSave)
	}
	const throttledPersistAndReset = throttle(persistAndReset, cfg.AGGR_THROTTLE, { leading: false, trailing: true })

	return function(userId, events) {
		events.forEach(function(ev) {
			// @TODO: this is one of the places to add other ev types
			if (ev.type === 'IMPRESSION') {
				o.events.IMPRESSION = mergeImpressionEv(o.events.IMPRESSION, ev)
			}
		})
		throttledPersistAndReset()
	}
}

function mergeImpressionEv(map, ev) {
	if (!ev.publisher) return map
	if (!map) map = {}
	if (!map[ev.publisher]) map[ev.publisher] = 0
	map[ev.publisher]++
	return map
}

function logAggregate(channelId, o) {
	console.log(`sentry: channel ${channelId}: event aggregate produced, events for ${Object.keys(o.events).length} users`)
}

module.exports = { record }
