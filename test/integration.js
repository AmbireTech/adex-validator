#!/usr/bin/env node
const tape = require('tape')
const fetch = require('node-fetch')

// those are hardcoded in ./test/prep-db
const leaderUrl = 'http://localhost:8005'
const followerUrl = 'http://localhost:8006'
const authToken = 'x8c9v1b2'
const channelId = 'awesomeTestChannel'

tape('/channel/list', function(t) {
	fetch(`${leaderUrl}/channel/list`)
	.then(res => res.json())
	.then(function(resp) {
		t.ok(Array.isArray(resp.channels), 'resp.channels is an array')
		t.equal(resp.channels.length, 1, 'resp.channels is the right len')
		t.equal(resp.channels[0].status, 'live', 'channel is the right status')
		t.end()
	})
	// @TODO: test channel list filters if there are any
})

tape('/channel/{id}/tree', function(t) {
	fetch(`${leaderUrl}/channel/${channelId}/tree`)
	.then(res => res.json())
	.then(function(resp) {
		console.log(resp)
		t.end()
	})
})

tape('submit events', function(t) {
	const evData ='{"events": [{"type": "IMPRESSION", "publisher": "myAwesomePublisher"}]}'
	Promise.all(
		[leaderUrl, followerUrl].map(url =>
			fetch(`${url}/channel/${channelId}/events`, {
				method: 'POST',
				headers: {
					'authorization': `Bearer ${authToken}`,
					'content-type': 'application/json',
				},
				data: evData
			})
		)
	)
	.then(function([leaderRes, followerRes]) {
		console.log(leaderRes, followerRes)
		return wait(30000)
	})
	.then(function() {
		return fetch(`${leaderUrl}/channel/${channelId}/tree`)
		.then(res => res.json())
	})
	.then(function(channelTree) {
		console.log(channelTree)
	})
})


function wait(ms) {
	return new Promise((resolve, reject) => setTimeout(resolve, ms))
}

// @TODO can't trick with negative values
// @TODO cannot excdeed deposits
// @TODO can't submit states that aren't signed and valid (everything re msg propagation)
