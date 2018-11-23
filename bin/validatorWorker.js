#!/usr/bin/env node
const db = require('../db')
const { tick } = require('../services/validatorWorker/producer')

// @TODO: depending on role, use either producer.tick, leader.tick or follower.tick

// @TODO: choose that in a rational way, rather than using a magic number
const MAX_CHANNELS = 512
const SNOOZE_TIME = 20000
const WAIT_TIME = 1000

db.connect()
.then(function() {
	const channelsCol = db.getMongo().collection('channels')
	
	function allChannelsTick() {
		return channelsCol.find()
		.limit(MAX_CHANNELS)
		.toArray()
		.then(function(channels) {
			logPreChannelsTick(channels)
			// @TODO: for each channel, map to a tick that decides whether we're a leader or a follower and does the appropriate action
			return Promise.all([
				Promise.all(channels.map(tick)),
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
