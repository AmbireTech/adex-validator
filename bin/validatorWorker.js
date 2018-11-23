#!/usr/bin/env node
const assert = require('assert')
const db = require('../db')
const adapter = require('../adapter')
const producer = require('../services/validatorWorker/producer')
const leader = require('../services/validatorWorker/leader')
const follower = require('../services/validatorWorker/follower')

// @TODO: choose that in a rational way, rather than using a magic number
const MAX_CHANNELS = 512
const SNOOZE_TIME = 20000
const WAIT_TIME = 1000

db.connect()
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
			if (allResults.every(x => !x.newStateTree)) {
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
	return producer.tick(channel)
	.then(function(result) {
		// NOTE: this must always return result
		// if there is no no new state, do nothing
		if (!result.newStateTree) {
			return result
		}

		const validatorIdx = channel.validators.indexOf(adapter.whoami())
		assert.ok(validatorIdx >= 0, 'validatorTick: processing a channel where we are not validating')

		const isLeader = validatorIdx == 0
		const tick = isLeader ? leader.tick : follower.tick
		return tick(result).then(() => result)
	})
}

function wait(ms) {
	return new Promise((resolve, reject) => setTimeout(resolve, ms))
}

function logSnooze() {
	// @TODO: optional
	console.log(`validatorWorker: Snoozing, all channels up to date`)
}

function logPreChannelsTick(channels) {
	// @TODO optional
	console.log(`validatorWorker: Processing ${channels.length} channels`)
}
