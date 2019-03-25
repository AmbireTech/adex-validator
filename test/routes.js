#!/usr/bin/env node

const tape = require('tape-catch')
const fetch = require('node-fetch')
const { postEvents } = require('./lib')

// const cfg = require('../cfg')
const dummyVals = require('./prep-db/mongo')

const leaderUrl = dummyVals.channel.spec.validators[0].url
const followerUrl = dummyVals.channel.spec.validators[1].url
// const defaultPubName = dummyVals.ids.publisher
const expectedDepositAmnt = dummyVals.channel.depositAmount

tape('/channel/list', async function(t) {
	const resp = await fetch(`${leaderUrl}/channel/list`).then(res => res.json())
	t.ok(Array.isArray(resp.channels), 'resp.channels is an array')
	t.equal(resp.channels.length, 1, 'resp.channels is the right len')
	t.end()
	// @TODO: test channel list filters if there are any
})

tape('/channel/{id}/{status,validator-messages}: non existant channel', async function(t) {
	await Promise.all(
		['status', 'validator-messages'].map(path =>
			fetch(`${leaderUrl}/channel/xxxtentacion/${path}`).then(function(res) {
				t.equal(res.status, 404, 'status should be 404')
			})
		)
	)
	t.end()
})

tape('POST /channel/{id}/events: non existant channel', async function(t) {
	const resp = await postEvents(leaderUrl, 'xxxtentacion', [])
	t.equal(resp.status, 404, 'status should be 404')
	t.end()
})

tape('/channel/{id}/status', async function(t) {
	const resp = await fetch(`${leaderUrl}/channel/${dummyVals.channel.id}/status`).then(res =>
		res.json()
	)
	t.ok(resp.channel, 'has resp.channel')
	t.equal(resp.channel.depositAmount, expectedDepositAmnt, 'depositAmount is as expected')
	t.end()
})

tape(
	'POST /channel/{id}/validator-messages: malformed messages (leader -> follower)',
	async function(t) {
		await Promise.all(
			[
				null,
				{ type: 1 },
				{ type: 'NewState' },
				{ type: 'NewState', balances: 'iamobject' },
				{ type: 'ApproveState', stateRoot: 'notlongenough', signature: 'something' }
			].map(msg =>
				fetch(`${followerUrl}/channel/${dummyVals.channel.id}/validator-messages`, {
					method: 'POST',
					headers: {
						authorization: `Bearer ${dummyVals.auth.leader}`,
						'content-type': 'application/json'
					},
					body: JSON.stringify({ messages: [msg] })
				}).then(function(resp) {
					t.equal(resp.status, 400, 'status must be BadRequest')
				})
			)
		)
		t.end()
	}
)

tape('POST /channel/{id}/events: malformed events', async function(t) {
	await Promise.all(
		[null, { type: 1 }, { type: null }].map(ev =>
			fetch(`${leaderUrl}/channel/${dummyVals.channel.id}/events`, {
				method: 'POST',
				headers: {
					authorization: `Bearer ${dummyVals.auth.user}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({ events: [ev] })
			}).then(function(resp) {
				t.equal(resp.status, 400, 'status is BadRequest')
			})
		)
	)
	t.end()
})

tape('POST /channel/{id}/{events,validator-messages}: wrong authentication', async function(t) {
	await Promise.all(
		['events', 'validator-messages'].map(path =>
			fetch(`${leaderUrl}/channel/${dummyVals.channel.id}/${path}`, {
				method: 'POST',
				headers: {
					authorization: `Bearer WRONG AUTH`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({ messages: [] })
			}).then(function(resp) {
				t.equal(resp.status, 401, 'status must be Unauthorized')
			})
		)
	)
	t.end()
})

tape('POST /channel: create channel', async function(t) {
	const body = {
		id: 'awesomeTestChannel',
		creator: 'someone',
		depositAsset: 'DAI',
		depositAmount: 1000,
		spec: {
			validators: [
				{ id: 'awesomeLeader', url: 'http://localhost:8005', fee: 100 },
				{ id: 'awesomeFollower', url: 'http://localhost:8006', fee: 100 }
			]
		}
	}

	const resp = await fetch(`${followerUrl}/channel`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${dummyVals.auth.leader}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify(body)
	}).then(res => res.json())

	t.equal(resp.success, true, 'Successfully created channel')
	t.end()
})

tape('POST /channel: should not create channel if it is not valid', async function(t) {
	await Promise.all(
		[
			// does not have ID
			{
				creator: 'someone',
				depositAsset: 'DAI',
				depositAmount: 1000,
				spec: {
					validators: [
						{ id: 'awesomeLeader', url: 'http://localhost:8005', fee: 100 },
						{ id: 'awesomeFollower', url: 'http://localhost:8006', fee: 100 }
					]
				}
			},
			// does not have anything
			{
				id: 'awesomeTestChannel'
			},
			// does not have enough validators
			{
				id: 'test',
				creator: 'someone',
				depositAsset: 'DAI',
				depositAmount: 1000,
				spec: {
					validators: [
						{ id: 'awesomeLeader', url: 'http://localhost:8005' },
						{ id: 'awesomeFollower', url: 'http://localhost:8006' }
					]
				}
			}
		].map(function(body) {
			return fetch(`${followerUrl}/channel`, {
				method: 'POST',
				headers: {
					authorization: `Bearer ${dummyVals.auth.leader}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify(body)
			}).then(function(resp) {
				t.equal(resp.status, 400, 'status must be BadRequest')
			})
		})
	)
	t.end()
})
