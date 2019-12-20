#!/usr/bin/env node

const tape = require('tape-catch')
const fetch = require('node-fetch')
const { exec } = require('./lib')
const dummyVals = require('./prep-db/mongo')
const db = require('../db')

// connect to database
db.connect()
const leaderUrl = dummyVals.channel.spec.validators[0].url

tape('prune.sh: prune only heartbeat messages for an unexpired channel', async t => {
	const { DB_MONGO_NAME } = process.env
	const id = dummyVals.channel.id
	await exec(
		`DB_MONGO_NAME='${DB_MONGO_NAME}' ./scripts/prune.js --channelId='${id}' --sentryUrl=${leaderUrl}`
	)
	const messages = await fetch(
		`${leaderUrl}/channel/${id}/validator-messages/${dummyVals.ids.leader}/Heartbeat`
	).then(res => res.json())
	t.equal(
		messages.validatorMessages.length,
		1,
		'should prune heartbeat messages lesser than timestamp'
	)
	t.end()
})

tape('prune.sh: prune all validator messages for an expired channel', async t => {
	const { DB_MONGO_NAME } = process.env
	const id = dummyVals.channel.id
	const channelCol = db.getMongo().collection('channels')
	await channelCol.updateOne({ id }, { $set: { validUntil: 100 } })

	await exec(
		`DB_MONGO_NAME='${DB_MONGO_NAME}' ./scripts/prune.js --channelId='${id}' --sentryUrl=${leaderUrl}`
	)
	const NewState = await fetch(
		`${leaderUrl}/channel/${id}/validator-messages/${dummyVals.ids.leader}/NewState`
	).then(res => res.json())
	const ApproveState = await fetch(
		`${leaderUrl}/channel/${id}/validator-messages/${dummyVals.ids.follower}/ApproveState`
	).then(res => res.json())
	t.equal(NewState.validatorMessages.length, 1, 'should delete most NewState validator messages')
	t.equal(
		ApproveState.validatorMessages.length,
		1,
		'should delete most ApproveState validator messages'
	)
	t.end()
})

tape('prune.sh: prune validator messages for expired channels', async t => {
	const { channels } = await fetch(`${leaderUrl}/channel/list`).then(res => res.json())
	// update all channels created to expired channels
	const channelCol = db.getMongo().collection('channels')
	await channelCol.updateMany({}, { $set: { validUntil: 100 } })

	const { DB_MONGO_NAME } = process.env
	await exec(`DB_MONGO_NAME='${DB_MONGO_NAME}' ./scripts/prune.js --all --sentryUrl=${leaderUrl}`)

	await Promise.all(
		channels.map(async ({ id }) => {
			// Some channels do not have those messages to begin with
			/*
			const { lastApproved, heartbeats } = await fetch(`${leaderUrl}/channel/${id}/last-approved`).then(res => res.json())
			t.ok(lastApproved.newState, 'has last newState')
			t.ok(lastApproved.approveState, 'has last approveState')
			t.ok(heartbeats.length, 'has heartbeats')
			*/
			const hbs = await fetch(
				`${leaderUrl}/channel/${id}/validator-messages/${dummyVals.ids.leader}/Hearbeat?limit=10`
			).then(res => res.json())
			t.ok(hbs.validatorMessages.length <= 1, 'should delete messages')
		})
	)

	t.end()
})
// tape.on
tape.onFinish(() => process.exit())
