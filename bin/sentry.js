#!/usr/bin/env node
const express = require('express')
const app = express()
const port = 8005

// Channel information: public, cachable
app.get('/channel/:id/status', (req, res) => res.send({}))
app.get('/channel/:id/tree', (req, res) => res.send({}))
app.get('/channel/list', (req, res) => res.send([]))

// Channel information: requires auth, cachable
app.get('/channel/:uid/events', (req, res) => res.send([]))

// Submitting events/messages: requires auth
app.post('/channel/:id/events', (req, res) => res.send([]))
app.post('/channel/:id/validator-messages', (req, res) => res.send([]))

app.listen(port, () => console.log(`Sentry listening on port ${port}!`))
