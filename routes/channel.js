const express = require('express')
const db = require('../db')
const cfg = require('../cfg')
const { channelLoad, channelIfExists, channelIfActive } = require('../middlewares/channel')
const eventAggrService = require('../services/sentry/eventAggregator')

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
router.get('/:id/last-approved', channelLoad, getLastApprovedMessages)
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

// Implementation of getValidatorMessages
// It retrieves the last N validator messages
const VALIDATOR_MSGS_PROJ = { _id: 0, channelId: 0 }
function getValidatorMessages(req, res, next) {
	const { type, id, uid } = req.params
	const { limit } = req.query

	const validatorMsgCol = db.getMongo().collection('validatorMessages')
	const query = { channelId: id }
	if (typeof uid === 'string') query.from = uid
	if (typeof type === 'string') query['msg.type'] = type

	validatorMsgCol
		.find(query, { projection: VALIDATOR_MSGS_PROJ })
		.sort({ received: -1 })
		.limit(limit ? Math.min(cfg.MSGS_FIND_LIMIT, limit) : cfg.MSGS_FIND_LIMIT)
		.toArray()
		.then(function(validatorMessages) {
			res.send({ validatorMessages, channel: req.channel })
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
				from: channel.validators[1],
				'msg.type': 'ApproveState'
			},
			{ projection: VALIDATOR_MSGS_PROJ }
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
			from: channel.validators[0],
			'msg.type': 'NewState',
			'msg.stateRoot': approveState.msg.stateRoot
		},
		{ projection: VALIDATOR_MSGS_PROJ }
	)
	if (newState) {
		return { newState, approveState }
	}
	return null
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
