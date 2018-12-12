#!/usr/bin/env node
const assert = require('assert')
const yargs = require('yargs')
const db = require('../db')
const adapters = require('../adapters')
const leader = require('../services/validatorWorker/leader')
const follower = require('../services/validatorWorker/follower')

// @TODO: choose that in a rational way, rather than using a magic number
const MAX_CHANNELS = 512
const SNOOZE_TIME = 20000
const WAIT_TIME = 1000

const argv = yargs
	.usage('Usage $0 [options]')
	.describe('adapter', 'the adapter for authentication and signing')
	.choices('adapter', Object.keys(adapters))
	.default('adapter', 'ethereum')
	.describe('keystoreFile', 'path to JSON Ethereum keystore file')
	.describe('keystorePwd', 'password to unlock the Ethereum keystore file')
	.describe('dummyIdentity', 'the identity to use with the dummy adapter')
	.demandOption(['adapter'])
	.argv

const adapter = adapters[argv.adapter]

db.connect()
.then(function() {
	return adapter.init(argv)
	.then(() => adapter.unlock(argv))
})
.then(function() {
	const channelsCol = db.getMongo().collection('channels')
	
	function allChannelsTick() {
		return channelsCol.find({ validators: adapter.whoami() })
		.limit(MAX_CHANNELS)
		.toArray()
		.then(function(channels) {
			logPreChannelsTick(channels)
			return Promise.all([
				Promise.all(channels.map(validatorTick)),
				wait(WAIT_TIME)
			])
		})
		.then(function([allResults, _]) {
			// If nothing is new, snooze
			if (allResults.every(x => x && x.nothingNew)) {
				logSnooze(allResults)
				return wait(SNOOZE_TIME)
			}
		})
	}

	function loopChannels() {
		allChannelsTick()
		.then(function() { loopChannels() })
	}

	loopChannels()
})
.catch(function(err) {
	console.error('Fatal error while connecting to the database', err)
	process.exit(1)
})

function validatorTick(channel) {
	const validatorIdx = channel.validators.indexOf(adapter.whoami())
	assert.ok(validatorIdx >= 0, 'validatorTick: processing a channel where we are not validating')

	const isLeader = validatorIdx == 0
	const tick = isLeader ? leader.tick : follower.tick
	return tick(adapter, channel)
}

function wait(ms) {
	return new Promise((resolve, reject) => setTimeout(resolve, ms))
}

function logSnooze() {
	console.log(`validatorWorker: Snoozing, all channels up to date`)
}

function logPreChannelsTick(channels) {
	console.log(`validatorWorker: Processing ${channels.length} channels`)
}
