const express = require('express')
const db = require('../db')
const { authRequired } = require('../middlewares/auth')
const { channelLoad, channelIfExists } = require('../middlewares/channel')
const eventAggrService = require('../services/eventAggregator')

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
	res.send({ channel: req.channel })
}

function getList(req, res, next) {
	const channelsCol = db.getMongo().collection('channels')

	return channelsCol.find()
	.limit(CHANNELS_FIND_MAX)
	.toArray()
	.then(function(channels) {
		// @TODO should we sanitize? probably not; perhaps rewrite _id to id
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


