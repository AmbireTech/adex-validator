const express = require('express')
const { celebrate } = require('celebrate')
const schema = require('./schemas')
const db = require('../db')
const cfg = require('../cfg')
const { channelLoad, channelIfExists, channelIfActive } = require('../middlewares/channel')
const eventAggrService = require('../services/sentry/eventAggregator')

const router = express.Router()

// Channel information: public, cachable
router.get('/list', getList)
router.get('/:id/status', channelLoad, getStatus)

// Validator information
router.get('/:id/validator-messages', channelIfExists, getValidatorMessages)
router.get('/:id/last-approved', channelLoad, getLastApprovedMessages)
router.get('/:id/validator-messages/:uid/:type?', channelIfExists, getValidatorMessages)

// event aggregates information
router.get('/:id/events-aggregates', authRequired, channelLoad, getEventAggregates)

// Submitting events/messages: requires auth
router.post(
	'/:id/validator-messages',
	authRequired,
	celebrate({ body: schema.validatorMessage }),
	channelLoad,
	postValidatorMessages
)
router.post('/:id/events', celebrate({ body: schema.events }), channelIfActive, postEvents)

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
	const isSuperuser = channel.spec.validators.find(v => v.id === uid)
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
	const { page = 0 } = req.query

	const channelsCol = db.getMongo().collection('channels')
	const skip = page && parseInt(page, 10) * CHANNELS_FIND_LIMIT
	let query = {
		validUntil: { $gt: Math.floor(Date.now() / 1000) }
	}
	if (typeof req.query.validator === 'string') {
		// This is MongoDB behavior: since validators is an array,
		// this query will find anything where the array contains an object with this ID
		query = { ...query, 'spec.validators.id': req.query.validator }
	}

	const channelTotal = await channelsCol.countDocuments(query)
	// subtract one becuase page counting starts from 0
	const totalPages = Math.ceil(channelTotal / CHANNELS_FIND_LIMIT) - 1

	return channelsCol
		.find(query, { projection: { _id: 0 } })
		.limit(CHANNELS_FIND_LIMIT)
		.skip(skip || 0)
		.toArray()
		.then(function(channels) {
			res.send({ channels, total: totalPages, page })
		})
		.catch(next)
}

// Implementation of getValidatorMessages
// It retrieves the last N validator messages
const VALIDATOR_MSGS_PROJ = { _id: 0, channelId: 0 }
function getValidatorMessages(req, res, next) {
	const { type, id, uid } = req.params
	const { limit } = req.query

	const validatorMsgCol = db.getMongo().collection('validatorMessages')
	let query = { channelId: id }
	if (typeof uid === 'string') query = { ...query, from: uid }
	if (typeof type === 'string') {
		query = { ...query, 'msg.type': { $in: type.split('+') } }
	}

	validatorMsgCol
		.find(query, { projection: VALIDATOR_MSGS_PROJ })
		.sort({ received: -1 })
		.limit(limit ? Math.min(cfg.MSGS_FIND_LIMIT, limit) : cfg.MSGS_FIND_LIMIT)
		.toArray()
		.then(function(validatorMessages) {
			res.send({ validatorMessages })
		})
		.catch(next)
}

function getLastApprovedMessages(req, res, next) {
	retrieveLastApproved(req.channel)
		.then(lastApproved => res.send({ lastApproved }))
		.catch(next)
}

async function retrieveLastApproved(channel) {
	const validatorMsgCol = db.getMongo().collection('validatorMessages')
	const approveStateMsgs = await validatorMsgCol
		.find(
			{
				channelId: channel.id,
				from: channel.spec.validators[1].id,
				'msg.type': 'ApproveState'
			},
			{
				projection: VALIDATOR_MSGS_PROJ
			}
		)
		.sort({ received: -1 })
		.limit(1)
		.toArray()
	if (!approveStateMsgs.length) {
		return null
	}
	const approveState = approveStateMsgs[0]
	const newState = await validatorMsgCol.findOne(
		{
			channelId: channel.id,
			from: channel.spec.validators[0].id,
			'msg.type': 'NewState',
			'msg.stateRoot': approveState.msg.stateRoot
		},
		{
			projection: VALIDATOR_MSGS_PROJ
		}
	)
	if (newState) {
		return { newState, approveState }
	}
	return null
}

function postValidatorMessages(req, res, next) {
	if (!req.channel.spec.validators.find(v => v.id === req.session.uid)) {
		res.sendStatus(401)
		return
	}
	const validatorMsgCol = db.getMongo().collection('validatorMessages')
	const { messages } = req.body

	const startTime = Date.now()
	const toInsert = messages.map((msg, idx) =>
		validatorMsgCol.insertOne({
			channelId: req.channel.id,
			from: req.session.uid,
			msg,
			// This is a hack to help ordering
			// MongoDB has no notion of auto-increment, so it's not that appropriate
			// for this but we'll swap it out eventually
			received: new Date(startTime + idx)
		})
	)
	Promise.all(toInsert)
		.then(function() {
			res.send({ success: true })
		})
		.catch(next)
}

function postEvents(req, res, next) {
	const { events } = req.body
	const trueip = req.headers['true-client-ip']
	const xforwardedfor = req.headers['x-forwarded-for']
	const ip = trueip || (xforwardedfor ? xforwardedfor.split(',')[0] : null)
	eventAggrService
		.record(req.params.id, { ...req.session, ip }, events)
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
