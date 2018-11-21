const express = require('express')
const db = require('../db')
const { authRequired } = require('../middlewares/auth')
const { channelLoad, channelIfExists } = require('../middlewares/channel')

const router = express.Router()

// @TODO: channel middleware

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

function getList(req, res) {
	const channelsCol = db.getMongo().collection('channels')
	// @TODO: what happens on error?
	return channelsCol.find()
	.limit(100)
	.toArray()
	.then(function(channels) {
		// @TODO should we sanitize? probably not; perhaps rewrite _id to id
		res.send({ channels })
	})
}

function postValidatorMessages(req, res) {
	// @TODO req.channel.validators contains req.session.uid
	res.send({})
}

// @TODO: per-channel singleton that keeps the aggregate state
// and flushes it every N seconds
function postEvents(req, res) {
	res.send({})
}


// Export it
module.exports = router


