#!/usr/bin/env node
const db = require('../db')
const { tick } = require('../services/validatorWorker/producer')

// @TODO: depending on role, use either producer.tick, leader.tick or follower.tick

// @TODO: choose that in a rational way, rather than using a magic number
const MAX_CHANNELS = 512
const SNOOZE_TIME = 20000

db.connect()
.then(function() {
	const channelsCol = db.getMongo().collection('channels')
	
	function allChannelsTick() {
		return channelsCol.find()
		.limit(MAX_CHANNELS)
		.toArray()
		.then(function(channels) {
			logPreChannelsTick(channels)
			return Promise.all(channels.map(tick))
		})
		.then(function(allResults) {
			// If nothing is new, snooze
			if (allResults.every(x => x.updated === false)) {
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
