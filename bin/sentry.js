#!/usr/bin/env node
const express = require('express')
const db = require('../db')
const channelRoutes = require('../routes/channel')

const app = express()
const port = process.env.PORT || 8005

app.use('/channel', channelRoutes)

db.connect()
.then(function() {
	app.listen(port, () => console.log(`Sentry listening on port ${port}!`))
})
.catch(function(err) {
	console.error('Fatal error while connecting to the database', err)
	process.exit(1)
})
