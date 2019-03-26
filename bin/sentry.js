#!/usr/bin/env node
const express = require('express')
const bodyParser = require('body-parser')
const { errors } = require('celebrate')
const yargs = require('yargs')
const db = require('../db')
const cfg = require('../cfg')
const adapters = require('../adapters')
const authMiddleware = require('../middlewares/auth')
const channelRoutes = require('../routes/channel')
const channelCreate = require('../routes/channelCreate')

const { argv } = yargs
	.usage('Usage $0 [options]')
	.describe('adapter', 'the adapter for authentication and signing')
	.choices('adapter', Object.keys(adapters))
	.default('adapter', 'ethereum')
	.describe('keystoreFile', 'path to JSON Ethereum keystore file')
	.describe('dummyIdentity', 'the identity to use with the dummy adapter')
	.demandOption(['adapter'])

const adapter = adapters[argv.adapter]
const app = express()
const port = process.env.PORT || 8005

app.use(bodyParser.json())
app.use(authMiddleware.forAdapter(adapter))
app.use('/channel', channelRoutes)
app.use('/channel', channelCreate.forAdapter(adapter))
app.use('/cfg', (_, res) => res.send(cfg))
app.use(errors())

db.connect()
	.then(function() {
		return adapter.init(argv)
	})
	.then(function() {
		// eslint-disable-next-line no-console
		app.listen(port, () => console.log(`Sentry listening on port ${port}!`))
	})
	.catch(function(err) {
		// eslint-disable-next-line no-console
		console.error('Fatal error while connecting to the database', err)
		process.exit(1)
	})
