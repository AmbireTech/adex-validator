const db = require('../db')

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
	let o = newObject()
	return function(userId, events) {
		events.forEach(function(ev) {
			if (!o.events[userId]) o.events[userId] = {}
			if (!o.events[userId][ev.type]) o.events[userId][ev.type] = 0
			o.events[userId][ev.type]++
		})
		// @TODO: proper throttling here
		if (Date.now()-o.created.getTime() > AGGREGATION_THROTTLE) {
			const toSave = o

			// informative
			logAggregate(toSave)

			// this has to be flushed immediately cause otherwise we will drop
			// everything received while we're sending
			o = newObject()
			// however, this carries the risk of dropping events if this fails
			// @TODO: make this a queue of all eventAggregates to be saved, will solve the issue
			eventAggrCol.insertOne(toSave)
			.catch(function(err) {
				console.error('eventAggregator fatail error', err)
			})
		}
	}
}

function logAggregate(o) {
	// @TODO: optional
	console.log(`Event aggregate produced: ${o.events}`)
}

module.exports = { record }
