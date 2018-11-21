const express = require('express')

const router = express.Router()

// Channel information: public, cachable
router.get('/:id/status', (req, res) => res.send({}))
router.get('/:id/tree', (req, res) => res.send({}))
router.get('/list', (req, res) => res.send([]))

// Channel information: requires auth, cachable
router.get('/:uid/events', (req, res) => res.send([]))

// Submitting events/messages: requires auth
router.post('/:id/events', (req, res) => res.send([]))
router.post('/:id/validator-messages', (req, res) => res.send([]))

// Export it
module.exports = router


