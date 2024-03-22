const throttle = require('lodash.throttle')
const db = require('../../db')
const cfg = require('../../cfg')
const analyticsRecorder = require('./analyticsRecorder')
const analyticsRecorderV5 = require('./analyticsRecorderV5')
const analyticsRecorderV5Offchain = require('./analyticsRecorderV5Offchain')
const eventReducer = require('./lib/eventReducer')
const getPayout = require('./lib/getPayout')
const checkAccess = require('./lib/access')
const logger = require('../logger')('sentry')
const { eventTypes } = require('../constants')
const { channelExhausted } = require('./lib')

const recorders = new Map()

function record(id, session, events) {
	if (!recorders.has(id)) {
		recorders.set(id, makeRecorder(id))
	}

	return recorders.get(id)(session, events)
}

function makeRecorder(channelId) {
	const eventAggrCol = db.getMongo().collection('eventAggregates')
	const channelsCol = db.getMongo().collection('channels')

	// get the channel
	let channelPromise = channelsCol.findOne({ _id: channelId })

	// update channel promise
	setInterval(() => {
		channelPromise = channelsCol.findOne({ _id: channelId })
	}, cfg.CHANNEL_REFRESH_INTERVAL)

	// persist each individual aggregate
	// this is done in a one-at-a-time queue, with re-trying, to ensure everything is saved
	let saveQueue = Promise.resolve()
	const persist = function(toSave) {
		saveQueue = saveQueue.then(function() {
			// created needs to be set to the latest date right before saving, otherwise we risk data inconsistency when running in clustered mode
			return eventAggrCol.insertOne({ ...toSave, created: new Date() }).catch(function(err) {
				logger.error(`eventAggregator fatal error: ${err.message || err}; will re-try`)
				persist(toSave)
			})
		})
	}

	// persist and reset
	// `aggr` is the current event aggregate record
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
	const throttledPersistAndReset = throttle(persistAndReset, cfg.AGGR_THROTTLE, {
		leading: false,
		trailing: true
	})

	// return a recorder
	return async function(session, events) {
		const channel = await channelPromise

		if (channelExhausted(channel)) {
			return { success: false, statusCode: 410, message: 'channel is exhausted' }
		}

		const hasAccess = await checkAccess(channel, session, events)
		if (!hasAccess.success) {
			return hasAccess
		}

		const targetingRulesEv = events.find(x => x.type === eventTypes.update_targeting)
		if (targetingRulesEv) {
			await channelsCol.updateOne(
				{ id: channelId },
				{ $set: { targetingRules: targetingRulesEv.targetingRules } }
			)
		}

		// Pre-compute payouts once so we don't have to compute them separately in analytics/eventReducer
		// this is also where AIP31 is applied
		const payouts = events.map(ev => getPayout(channel, ev, session))
		if (events.length === 1 && events[0].publisher && !payouts[0]) {
			return { success: false, statusCode: 469, message: 'no event payout' }
		}

		// No need to wait for this, it's simply a stats recorder
		if (process.env.ANALYTICS_RECORDER) {
			analyticsRecorder.record(channel, session, events, payouts)
		}
		if (process.env.ANALYTICS_RECORDER_V5) {
			analyticsRecorderV5.record(channel, session, events, payouts)
		}
		if (process.env.ANALYTICS_RECORDER_V5_Offchain) {
			analyticsRecorderV5Offchain.record(channel, session, events, payouts)
		}

		// Keep in mind that at one point validator messages will be able to change payment/bidding information
		// this will be saved in the channel object, which is passed into the eventReducer

		// Record the events
		aggr = events.reduce(
			(acc, ev, i) => eventReducer.reduce(channel, acc, ev.type, payouts[i]),
			aggr
		)

		if (eventReducer.isEmpty(aggr)) {
			return { success: true }
		}

		if (cfg.AGGR_THROTTLE) {
			throttledPersistAndReset()
			return { success: true }
		}

		// switch over aggr to toSave, reset the aggr and
		// then insert into DB; this is done so that we never lose events,
		// even while inserting
		const toSave = aggr
		aggr = eventReducer.newAggr(channelId)
		toSave.created = new Date()
		await eventAggrCol.insertOne(toSave)
		return { success: true }
	}
}

function logAggregate(channelId) {
	logger.info(`channel ${channelId}: event aggregate produced`)
}

module.exports = { record }
