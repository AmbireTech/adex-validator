#!/usr/bin/env node
const db = require('../db')
const { tick } = require('../services/validatorWorker/producer')

// @TODO: depending on role, use either producer.tick, leader.tick or follower.tick

// @TODO: choose that in a rational way, rather than using a magic number
const MAX_CHANNELS = 512

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

function logPreChannelsTick(channels) {
	// @TODO optional
	console.log(`Processing ${channels.length} channels`)
}
