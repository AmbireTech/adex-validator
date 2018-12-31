#!/usr/bin/env node
const tape = require('tape')
const fetch = require('node-fetch')

// @TODO read this externally?
const leaderPort = 8005
const followerPort = 8006

tape('/channel/list', function(t) {
	fetch(`http://localhost:${leaderPort}/channel/list`)
	.then(res => res.json())
	.then(function(resp) {
		t.ok(Array.isArray(resp.channels), 'resp.channels is an array')
		t.equal(resp.channels.length, 1, 'resp.channels is the right len')
		t.equal(resp.channels[0].status, 'live', 'channel is the right status')
		t.end()
	})
	// @TODO: test channel list filters if there are any
})

// @TODO can't trick with negative values
// @TODO cannot excdeed deposits
// @TODO can't submit states that aren't signed and valid (everything re msg propagation)
