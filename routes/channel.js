const express = require('express')
const db = require('../db')
const { authRequired } = require('../middlewares/auth')
const { channelLoad, channelIfExists } = require('../middlewares/channel')
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
router.post('/:id/events', authRequired, channelIfExists, postEvents)


// Implementations
function getStatus(withTree, req, res) {
	//const channelsCol = db.getMongo().collection('channels')
	// @TODO should we sanitize? probably not; perhaps rewrite _id to id
	const resp = { channel: req.channel }

	Promise.resolve()
	.then(function() {
		if (withTree) {
			const channelStateTreesCol = db.getMongo().collection('channelStateTrees')
			return channelStateTreesCol.findOne({ _id: req.channel._id })
			.then(function(tree) { resp.tree = tree })
		}
	})
	.then(function() {
		res.send(resp)
	})
}

function getList(req, res, next) {
	const channelsCol = db.getMongo().collection('channels')

	return channelsCol
	.aggregate([{ '$project': { _id: 0, id: '$_id', status: 1 } }])
	.limit(CHANNELS_FIND_MAX)
	.toArray()
	.then(function(channels) {
		res.send({ channels })
	})
	.catch(next)
}

function postValidatorMessages(req, res) {
	// @TODO req.channel.validators contains req.session.uid
	res.send({})
}

// @TODO: per-channel singleton that keeps the aggregate state
// and flushes it every N seconds
// also, this should only accept active channels; the worker should monitor for active channels; `init` messages have to be exchanged
// @TODO: should this be channelIfActive ?
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


// Export it
module.exports = router


