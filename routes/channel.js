const express = require('express')
const { celebrate } = require('celebrate')
const db = require('../db')
const cfg = require('../cfg')
const { channelLoad, channelIfExists, channelIfActive } = require('../middlewares/channel')
const eventAggrService = require('../services/sentry/eventAggregator')
const schema = require('./schema')

const router = express.Router()

// Channel information: public, cachable
router.get('/list', getList)
router.get('/:id/status', channelLoad, getStatus.bind(null, false))
router.get('/:id/tree', channelLoad, getStatus.bind(null, true))

// Channel information: requires auth, cachable
// router.get('/:id/events/:uid', authRequired, channelIfExists, (req, res) => res.send([]))
// @TODO get events or at least eventAggregates

// Validator information
router.get('/:id/validator-messages', getValidatorMessages)
router.get(
	'/:id/validator-messages/:uid/:type?',
	channelIfExists,
	channelLoad,
	getValidatorMessages
)

// event aggregates information
router.get('/:id/events-aggregates', authRequired, channelIfExists, channelLoad, getEventAggregates)

// Submitting events/messages: requires auth
router.post('/:id/validator-messages', authRequired, channelLoad, postValidatorMessages)
router.post('/:id/events', authRequired, channelIfActive, postEvents)

// campaign
router.post(
	'/campaign',
	authRequired,
	celebrate({ body: schema.createCampaign(cfg) }),
	createCampaign
)

// Implementations
function getStatus(withTree, req, res) {
	const resp = { channel: req.channel }

	Promise.resolve()
		.then(function() {
			if (withTree) {
				const channelStateTreesCol = db.getMongo().collection('channelStateTrees')
				return channelStateTreesCol.findOne({ _id: req.channel.id }).then(function(tree) {
					if (tree) {
						resp.balances = tree.balances
						resp.balancesAfterFees = tree.balancesAfterFees
						resp.lastEvAggr = tree.lastEvAggr
					} else {
						resp.balances = {}
						resp.lastEvAggr = new Date(0)
					}
				})
			}
			return Promise.resolve()
		})
		.then(function() {
			res.send(resp)
		})
}

function getEventAggregates(req, res, next) {
	const { uid } = req.session
	const resp = { channel: req.channel }

	const eventsCol = db.getMongo().collection('eventAggregates')
	const key = `events.IMPRESSION.eventCounts.${uid}`

	return eventsCol
		.find(
			{
				[key]: { $exists: true }
			},
			{ projection: { [key]: 1, _id: 0, created: 1 } }
		)
		.limit(cfg.EVENTS_FIND_LIMIT)
		.toArray()
		.then(function(events) {
			res.send({ ...resp, events })
		})
		.catch(next)
}

function getList(req, res, next) {
	const channelsCol = db.getMongo().collection('channels')

	return channelsCol
		.find({}, { projection: { _id: 0 } })
		.limit(cfg.CHANNELS_FIND_LIMIT)
		.toArray()
		.then(function(channels) {
			res.send({ channels })
		})
		.catch(next)
}

// Implementation of getValidatorMessagesDetailed
// It retrieves the last recent N
// validator messages
function getValidatorMessages(req, res, next) {
	const { type, id, uid } = req.params
	const { limit } = req.query

	const validatorCol = db.getMongo().collection('validatorMessages')
	const query = { channelId: id }
	if (typeof uid === 'string') query.from = uid
	if (typeof type === 'string') query['msg.type'] = type

	validatorCol
		.find(query)
		.sort({ _id: -1 })
		.limit(limit ? Math.min(cfg.MSGS_FIND_LIMIT, limit) : cfg.MSGS_FIND_LIMIT)
		.toArray()
		.then(function(validatorMessages) {
			res.send({ validatorMessages, channel: req.channel })
		})
		.catch(next)
}

function createCampaign(req, res, next) {
	const { id, depositAmount, depositAsset, validators, spec, watcher } = req.body
	const channelCol = db.getMongo().collection('channel')
	const channel = {
		_id: id,
		depositAmount,
		depositAsset,
		validators,
		spec,
		watcher,
		status: 'pending',
		created: new Date().getTime()
	}

	channelCol
		.insertOne(channel)
		.then(function() {
			res.send({ success: true })
		})
		.catch(next)
}

function postValidatorMessages(req, res, next) {
	if (!req.channel.validators.includes(req.session.uid)) {
		res.sendStatus(401)
		return
	}

	const validatorMsgCol = db.getMongo().collection('validatorMessages')
	const { messages } = req.body
	const isValid = Array.isArray(messages) && messages.every(isValidatorMsgValid)
	if (!isValid) {
		res.sendStatus(400)
		return
	}

	const toInsert = messages.map(function(msg) {
		return validatorMsgCol.insertOne({
			channelId: req.channel.id,
			from: req.session.uid, // @TODO recover sig
			submittedBy: req.session.uid,
			msg
		})
	})
	Promise.all(toInsert)
		.then(function() {
			res.send({ success: true })
		})
		.catch(next)
}

function postEvents(req, res, next) {
	const { events } = req.body

	const isValid = Array.isArray(events) && events.every(isEventValid)
	if (!isValid) {
		res.sendStatus(400)
		return
	}
	eventAggrService
		.record(req.params.id, req.session.uid, events)
		.then(function() {
			res.send({ success: true })
		})
		.catch(next)
}

// Helpers
function isValidatorMsgValid(msg) {
	// @TODO either make this more sophisticated, or rewrite this in a type-safe lang
	// for example, we should validate if every value in balances is a positive integer
	return (
		msg &&
		((typeof msg.stateRoot === 'string' && msg.stateRoot.length === 64) ||
			typeof msg.timestamp === 'string') &&
		typeof msg.signature === 'string' &&
		((msg.type === 'NewState' && typeof msg.balances === 'object') ||
			msg.type === 'ApproveState' ||
			msg.type === 'Heartbeat')
	)
}

function isEventValid(ev) {
	return ev && typeof ev.type === 'string'
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
