const express = require('express')
const db = require('../db')
const { authRequired } = require('../middlewares/auth')

const router = express.Router()

// @TODO: channel middleware

// Channel information: public, cachable
router.get('/:id/status', (req, res) => res.send({}))
router.get('/:id/tree', (req, res) => res.send({}))
router.get('/list', (req, res) => res.send([]))

// Channel information: requires auth, cachable
//router.get('/:id/events/:uid', authRequired, (req, res) => res.send([]))
// @TODO get events or at least eventAggregates

// Submitting events/messages: requires auth
router.post('/:id/validator-messages', authRequired, (req, res) => res.send([]))
router.post('/:id/events', authRequired, (req, res) => res.send([]))


// Implementations
function getStatus(withTree, req, res) {
	const channelsCol = db.getMongo().collection('channels')
}

function getList(req, res) {
	const channelsCol = db.getMongo().collection('channels')
}

function postValidatorMessages(req, res) {
	// @TODO req.channel.validators contains req.session.uid
}

// @TODO: per-channel singleton that keeps the aggregate state
// and flushes it every N seconds
function postEvents(req, res) {
	
}


// Export it
module.exports = router


