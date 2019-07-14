const throttle = require('lodash.throttle')
const db = require('../../db')
const cfg = require('../../cfg')
const eventReducer = require('./lib/eventReducer')
const checkAccess = require('./lib/access')
const logger = require('../logger')('sentry')

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
	let channelPromise = channelsCol.findOne({ _id: channelId })
	// persist each individual aggregate
	// this is done in a one-at-a-time queue, with re-trying, to ensure everything is saved
	let saveQueue = Promise.resolve()
	const persist = function(toSave) {
		saveQueue = saveQueue.then(function() {
			// created needs to be set to the latest date right before saving, otherwise we risk data inconsistency when running in clustered mode
			return eventAggrCol.insertOne({ ...toSave, created: new Date() }).catch(function(err) {
				logger.error('eventAggregator fatal error; will re-try', err)
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

		channelPromise = channelsCol.findOne({ _id: channelId })
	}
	const throttledPersistAndReset = throttle(persistAndReset, cfg.AGGR_THROTTLE, {
		leading: false,
		trailing: true
	})

	const updateChannelPrice = async ev => {
		const price = ev.type === 'UPDATE_IMPRESSION_PRICE' ? ev.price : '0'
		await channelsCol.updateOne({ id: channelId }, { $set: { currentPricePerImpression: price } })
	}

	// return a recorder
	return async function(session, events) {
		const channel = await channelPromise
		const hasAccess = await checkAccess(channel, session, events)
		if (!hasAccess.success) {
			return hasAccess
		}
		// check if channel is paused
		if (channel.currentPricePerImpression && channel.currentPricePerImpression === '0') {
			return { success: false, statusCode: 400, message: 'channel is paused' }
		}

		// Record the events
		aggr = events.reduce(eventReducer.reduce.bind(null, channel), aggr)

		// check if events contained any channel price modifying event
		const priceModifyEvs = events.filter(
			x => x.type === 'UPDATE_IMPRESSION_PRICE' || x.type === 'PAUSE_CHANNEL'
		)
		if (priceModifyEvs.length) {
			await Promise.all(
				priceModifyEvs.map(async priceModifyEv => updateChannelPrice(priceModifyEv))
			)
			channelPromise = channelsCol.findOne({ _id: channel.id })
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
