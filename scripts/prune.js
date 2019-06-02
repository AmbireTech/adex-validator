#!/usr/bin/env node

// Description

// Prune  validatorMessages from the database
// An optional timestam can be passed or it prunes HeartBeat messages
// that are less than the current date and uses adexValidator as its default database
//
//
// Database
// ----------
// Default database it connects to is `adexValidator`
// but can be overwritten via the `DB_MONGO_NAME` environment variable
//
//
// Options
// ------------------------------------
// --channelId (required) prunes heartbeat validator messages for an unexpired channel and all validator messages for expired channel
// --timestamp ( default = current date ) should be used with `--channelId` to indicate when to prune validator messages from
// --all (optional) prune all expired channels validator messages
//
//
//
// Example
// ----------------------------------------
//
// Prune validator messages from `expiredChannel` in database X
// DB_MONGO_NAME='x' ./scripts/prune.js --channelId='expiredChannel'
//
// Prune validator messages from a specific date
// ./scripts/prune.js --timestamp='2012-01-01' --channelId='testing'
//
// Delete validator Messages for epxired channel
// ./scripts/prune.js --channelId='testing'
//
// Prune validator messages for all expired channels
// ./scripts/prune.js --all
//

const assert = require('assert')
const yargs = require('yargs')
const db = require('../db')
const logger = require('../services/logger')('prunning')

const { argv } = yargs
	.usage('Usage $0 [options]')
	.option('channelId')
	.describe('channelId', 'channelId to prune')
	.option('timestamp')
	.describe('timestamp', 'timestamp to prune heartbeat messages')
	.default('timestamp', new Date().toISOString())
	.boolean('all')
	.describe('all', 'delete validator messages for all expired channels')

async function start() {
	db.connect()
		.then(async () => {
			if (argv.all) {
				await pruneAll()
			} else {
				await run()
			}
			process.exit()
		})
		.catch(err => {
			logger.error(err.message)
		})
}

async function run() {
	const { channelId, timestamp } = argv
	assert.ok(typeof channelId === 'string', 'channelId has to be defined')
	const channelCol = db.getMongo().collection('channels')
	const validatorCol = db.getMongo().collection('validatorMessages')
	const result = await channelCol.findOne({ id: channelId })
	if (!result) {
		logger.error('Channel does not exist')
		return
	}
	// if channel not expired prune heartbeat messages
	if (result.validUntil > new Date().getTime() / 1000) {
		logger.info(`Deleting all validator hearbeat messages for channel ${channelId}`)
		await validatorCol.deleteMany({
			channelId,
			'msg.type': 'Heartbeat',
			received: { $lte: new Date(timestamp) }
		})
	} else {
		logger.info(`Deleting all validator messages for expired channel ${channelId}`)
		await validatorCol.deleteMany({
			channelId
		})
	}
	logger.info(`Successfully pruned heartbeat messages for channel ${channelId}`)
}

async function pruneAll() {
	const { timestamp } = argv
	const channelCol = db.getMongo().collection('channels')
	const validatorCol = db.getMongo().collection('validatorMessages')
	const channels = await (await channelCol.find({
		validUntil: { $lte: Math.ceil(new Date(timestamp).getTime() / 1000) }
	})).toArray()

	const result = await Promise.all(
		channels.map(async ({ id }) => {
			return validatorCol.deleteMany({
				channelId: id
			})
		})
	)

	logger.info(`Succesfully pruned all validator messages for ${result.length} expired channels`)
}

start().then(function() {})
