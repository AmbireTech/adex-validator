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
	.catch(err => t.fail(err))
	// @TODO: test channel list filters if there are any
})

tape('/channel/{id}/tree', function(t) {
	fetch(`${leaderUrl}/channel/${channelId}/tree`)
	.then(res => res.json())
	.then(function(resp) {
		t.ok(resp.channel, 'has resp.channel')
		t.equal(resp.channel.status, 'live', 'channel has right status')
		t.end()
	})
	.catch(err => t.fail(err))
})

tape('submit events and ensure they are accounted for', function(t) {
	const evBody = '{"events": [{"type": "IMPRESSION", "publisher": "myAwesomePublisher"}]}'
	const expectedBal = '1'
	let channelTree
	Promise.all(
		[leaderUrl, followerUrl].map(url =>
			fetch(`${url}/channel/${channelId}/events`, {
				method: 'POST',
				headers: {
					'authorization': `Bearer ${authToken}`,
					'content-type': 'application/json',
				},
				body: evBody
			})
		)
	)
	// @TODO: this number should be auto calibrated *cough*scientifically according to the event aggregate times and validator worker times
	// for that purpose, the following constants should be accessible from here
	// validatorWorker snooze time: 10s, eventAggregator service debounce: 10s
	// even for the balance tree, we need to wait for both, cause the producer tick updates it
	.then(() => wait(22000))
	.then(function() {
		return fetch(`${leaderUrl}/channel/${channelId}/tree`)
		.then(res => res.json())
	})
	.then(function(resp) {
		channelTree = resp
		t.equal(channelTree.balances.myAwesomePublisher, expectedBal, 'balances is right')
		// We will check the leader, cause this means this happened:
		// the NewState was generated, sent to the follower,
		// who generated ApproveState and sent back to the leader
		return fetch(`${leaderUrl}/channel/${channelId}/validator-messages`)
		.then(res => res.json())
	})
	.then(function(resp) {
		const msgs = resp.validatorMessages
		t.ok(Array.isArray(msgs), 'has validatorMessages')
		const latestNew = msgs.find(x => x.msg.type === 'NewState')
		const latestApprove = msgs.find(x => x.msg.type === 'ApproveState')
		t.ok(latestNew, 'has NewState')
		t.ok(latestApprove, 'has ApproveState')
		t.equal(latestNew.from, channelTree.channel.validators[0], 'NewState is by the leader')
		t.equal(latestApprove.from, channelTree.channel.validators[1], 'ApproveState is by the follower')
		t.equal(latestNew.msg.balances.myAwesomePublisher, expectedBal, 'balances is right')
		//console.log(channelTree.channel.validators)
		//console.log(latestNew, latestApprove)
		// @TODO other assertions
		t.end()
	})
	.catch(err => t.fail(err))
})


function wait(ms) {
	return new Promise((resolve, reject) => setTimeout(resolve, ms))
}

// @TODO can't trick with negative values
// @TODO cannot excdeed deposits
// @TODO can't submit states that aren't signed and valid (everything re msg propagation)
