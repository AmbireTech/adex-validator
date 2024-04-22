const express = require('express')
const { celebrate } = require('celebrate')
const UAParser = require('ua-parser-js')
const schema = require('./schemas')
const db = require('../db')
const cfg = require('../cfg')
const { channelLoad, channelIfActive } = require('../middlewares/channel')
const eventAggrService = require('../services/sentry/eventAggregatorOffchain')

const router = express.Router()

// Channel information: public, cachable
router.get('/list', getList)
router.get('/:id/status', channelLoad, getStatus)

// event aggregates information
router.get('/:id/events-aggregates', authRequired, channelLoad, getEventAggregates)

router.post('/:id/events', celebrate({ body: schema.eventsOffchain }), channelIfActive, postEvents)

// Implementations
function getStatus(req, res) {
	res.send({ channel: req.channel })
}

function getEventAggregates(req, res, next) {
	const eventsCol = db.getMongo().collection('eventAggregates')
	const { uid } = req.session
	const channel = req.channel
	let query = { channelId: channel.id }
	let projection = { _id: 0 }
	// const isSuperuser = channel.spec.validators.find(v => v.id === uid)
	const isSuperuser = true // channel.spec.validators.find(v => v.id === uid)
	if (!isSuperuser) {
		const keyCounts = `events.IMPRESSION.eventCounts.${uid}`
		const keyPayouts = `events.IMPRESSION.eventPayouts.${uid}`
		query = { ...query, [keyCounts]: { $exists: true } }
		projection = { ...projection, created: 1, [keyCounts]: 1, [keyPayouts]: 1 }
	}
	if (typeof req.query.after === 'string') {
		const after = parseInt(req.query.after, 10)
		query = { ...query, created: { $gt: new Date(after) } }
	}
	return eventsCol
		.find(query, { projection })
		.limit(cfg.EVENTS_FIND_LIMIT)
		.sort({ created: 1 })
		.toArray()
		.then(events => res.send({ channel, events }))
		.catch(next)
}

async function getList(req, res, next) {
	const { CHANNELS_FIND_LIMIT } = cfg
	// assign 0 default value
	const { page: paramsPage } = req.query
	const channelsCol = db.getMongo().collection('channels')
	const page = parseInt(paramsPage, 10) || 0
	const skip = page * CHANNELS_FIND_LIMIT
	const query = {}

	const channelTotal = await channelsCol.countDocuments(query)
	const totalPages = Math.ceil(channelTotal / CHANNELS_FIND_LIMIT)
	return channelsCol
		.find(query, { projection: { _id: 0 } })
		.limit(CHANNELS_FIND_LIMIT)
		.skip(skip || 0)
		.toArray()
		.then(function(channels) {
			res.send({ channels, total: totalPages, totalPages, page })
		})
		.catch(next)
}

function postEvents(req, res, next) {
	const { events } = req.body
	if (!Array.isArray(events)) {
		res.sendStatus(400)
		return
	}
	const referrerHeader = req.headers.referrer || req.headers.referer
	const trueip = req.headers['cf-connecting-ip'] || req.headers['true-client-ip']
	const xforwardedfor = req.headers['x-forwarded-for']
	const ua = UAParser(req.headers['user-agent'])
	const ip = trueip || (xforwardedfor ? xforwardedfor.split(',')[0] : null)
	const country = req.headers['cf-ipcountry']
	eventAggrService
		.record(req.params.id, { ...req.session, ip, country, referrerHeader, ua }, events)
		.then(function(resp) {
			res.status(resp.statusCode || 200).send(resp)
		})
		.catch(next)
}

function authRequired(req, res, next) {
	if (!req.session) {
		res.sendStatus(401)
		return
	}
	next()
}

// Export it
module.exports = router
