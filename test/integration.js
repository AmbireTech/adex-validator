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
	const evBody = JSON.stringify(getEventsImpressionsNum(3))
	const expectedBal = '3'

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
		// first wait though, as we need the follower to discover they have an event to approve
		return wait(11000).then(function() {
			return fetch(`${leaderUrl}/channel/${channelId}/validator-messages`)
			.then(res => res.json())
		})
	})
	.then(function(resp) {
		const msgs = resp.validatorMessages
		t.ok(Array.isArray(msgs), 'has validatorMessages')

		// ensure NewState is in order
		const lastNew = msgs.find(x => x.msg.type === 'NewState')
		t.ok(lastNew, 'has NewState')
		t.equal(lastNew.from, channelTree.channel.validators[0], 'NewState: is by the leader')
		t.equal(lastNew.msg.balances.myAwesomePublisher, expectedBal, 'NewState: balances is right')
		t.ok(typeof(lastNew.msg.stateRoot) === 'string' && lastNew.msg.stateRoot.length === 64, 'NewState: stateRoot is sane')
		t.equals(lastNew.msg.signature, getDummySig(lastNew.msg.stateRoot, lastNew.from), 'NewState: signature is sane')

		// Ensure ApproveState is in order
		const lastApprove = msgs.find(x => x.msg.type === 'ApproveState')
		t.ok(lastApprove, 'has ApproveState')
		t.equal(lastApprove.from, channelTree.channel.validators[1], 'ApproveState: is by the follower')
		t.ok(typeof(lastApprove.msg.stateRoot) === 'string' && lastApprove.msg.stateRoot.length === 64, 'ApproveState: stateRoot is sane')
		t.equals(lastApprove.msg.signature, getDummySig(lastApprove.msg.stateRoot, lastApprove.from), 'ApproveState: signature is sane')
		t.equals(lastNew.msg.stateRoot, lastApprove.msg.stateRoot, 'stateRoot is the same between latest NewState and ApproveState')
		t.equals(lastApprove.msg.health, 'HEALTHY', 'ApproveState: health value is HEALTHY')
		//console.log(channelTree.channel.validators)
		//console.log(lastNew, lastApprove)
		// @TODO other assertions
		t.end()
	})
	.catch(err => t.fail(err))
})

//tape('health would change', function() {
//})


function getEventsImpressionsNum(n) {
	const events = []
	for (let i=0; i<n; i++) events.push({ type: 'IMPRESSION', publisher: 'myAwesomePublisher' })
	return { events }
}

function getDummySig(hash, from) {
	return `Dummy adapter signature for ${hash} by ${from}`
}

function wait(ms) {
	return new Promise((resolve, reject) => setTimeout(resolve, ms))
}

// @TODO can't trick with negative values
// @TODO health state changes properly
// @TODO cannot excdeed deposits
// @TODO can't submit states that aren't signed and valid (everything re msg propagation); perhaps forge invalid states and try to submit directly by POST /channel/:id/validator-messages
