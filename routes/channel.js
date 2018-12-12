const express = require('express')
const db = require('../db')
const { channelLoad, channelIfExists, channelIfActive } = require('../middlewares/channel')
const eventAggrService = require('../services/sentry/eventAggregator')

const router = express.Router()

const CHANNELS_FIND_MAX = 100

// Channel information: public, cachable
router.get('/list', getList)
router.get('/:id/status', channelLoad, getStatus.bind(null, false))
router.get('/:id/tree', channelLoad, getStatus.bind(null, true))

// Channel information: requires auth, cachable
//router.get('/:id/events/:uid', authRequired, channelIfExists, (req, res) => res.send([]))
// @TODO get events or at least eventAggregates

// Submitting events/messages: requires auth
router.post('/:id/validator-messages', authRequired, channelLoad, postValidatorMessages)
router.post('/:id/events', authRequired, channelIfActive, postEvents)


// Implementations
function getStatus(withTree, req, res) {
	//const channelsCol = db.getMongo().collection('channels')
	// @TODO should we sanitize? probably not; perhaps rewrite _id to id
	const resp = { channel: req.channel }

	Promise.resolve()
	.then(function() {
		if (withTree) {
			const channelStateTreesCol = db.getMongo().collection('channelStateTrees')
			return channelStateTreesCol.findOne({ _id: req.channel.id })
			.then(function(tree) {
				resp.balances = tree.balances
				resp.lastEvAggr = tree.lastEvAggr
			})
		}
	})
	.then(function() {
		res.send(resp)
	})
}

function getList(req, res, next) {
	const channelsCol = db.getMongo().collection('channels')

	return channelsCol
	.find({}, { projection: { _id: 0 } })
	.limit(CHANNELS_FIND_MAX)
	.toArray()
	.then(function(channels) {
		res.send({ channels })
	})
	.catch(next)
}

function postValidatorMessages(req, res, next) {
	if (!req.channel.validators.includes(req.session.uid)) {
		res.sendStatus(401)
		return
	}

	const validatorMsgCol = db.getMongo().collection('validatorMessages')
	const messages = req.body.messages
	// @TODO: more sophisticated validation; perhaps make a model: new ValidatorMessage() and then .isValid()
	const isValid = Array.isArray(messages)
		&& messages.every(msg => msg.type === 'NewState' || msg.type === 'ApproveState')
	if (!isValid) {
		res.sendStatus(400)
		return
	}

	const toInsert = messages.map(
		msg => validatorMsgCol.insertOne({
			channelId: req.channel.id,
			from: req.session.uid,
			msg,
		})
	)
	Promise.all(toInsert)
	.then(function() {
		res.send({ success: true })
	})
	.catch(next)
}

function postEvents(req, res, next) {
	if (!Array.isArray(req.body.events)) {
		res.sendStatus(400)
		return
	}
	eventAggrService.record(req.params.id, req.session.uid, req.body.events)
	.then(function() {
		res.send({ success: true })
	})
	.catch(next)
}

// Helpers
function authRequired(req, res, next) {
	if (!req.session) {
		res.sendStatus(401)
		return
	}
	next()
}


// Export it
module.exports = router


