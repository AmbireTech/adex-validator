#!/usr/bin/env node

const tape = require('tape-catch')
const fetch = require('node-fetch')
const { exec } = require('./lib')
const dummyVals = require('./prep-db/mongo')
const db = require('../db')

// connect to database
db.connect()
const leaderUrl = dummyVals.channel.spec.validators[0].url

tape('prune.sh: prune heartbeat messages', async t => {
	const { DB_MONGO_NAME } = process.env
	const id = dummyVals.channel.id
	await exec(`DB_MONGO_NAME='${DB_MONGO_NAME}' ./scripts/prune.js --channelId='${id}'`)
	const messages = await fetch(
		`${leaderUrl}/channel/${id}/validator-messages/${dummyVals.ids.leader}/Heartbeat`
	).then(res => res.json())
	t.ok(
		messages.validatorMessages.length === 0,
		'should prune heartbeat messages lesser than timestamp'
	)
	t.end()
})

tape('prune.sh: prune all validator messages for an expired channel', async t => {
	const { DB_MONGO_NAME } = process.env
	const id = dummyVals.channel.id
	const channelCol = db.getMongo().collection('channels')
	await channelCol.updateOne({ id }, { $set: { validUntil: 100 } })

	await exec(`DB_MONGO_NAME='${DB_MONGO_NAME}' ./scripts/prune.js --channelId='${id}'`)
	const newstate = await fetch(
		`${leaderUrl}/channel/${id}/validator-messages/${dummyVals.ids.leader}/NewState`
	).then(res => res.json())
	const approvestate = await fetch(
		`${leaderUrl}/channel/${id}/validator-messages/${dummyVals.ids.leader}/ApproveState`
	).then(res => res.json())
	t.equal(newstate.validatorMessages.length, 0, 'should delete all newstate validator messages')
	t.equal(
		approvestate.validatorMessages.length,
		0,
		'should delete all approvestate validator messages'
	)
	t.end()
})

tape('prune.sh: prune validator messages for expired channels', async t => {
	const { channels } = await fetch(`${leaderUrl}/channel/list`).then(res => res.json())
	// update all channels create to expired channels
	const channelCol = db.getMongo().collection('channels')
	await channelCol.updateMany({}, { $set: { validUntil: 100 } })

	const { DB_MONGO_NAME } = process.env
	await exec(`DB_MONGO_NAME='${DB_MONGO_NAME}' ./scripts/prune.js --all`)

	await Promise.all(
		channels.map(async ({ id }) => {
			const newstate = await fetch(
				`${leaderUrl}/channel/${id}/validator-messages/${dummyVals.ids.leader}/NewState`
			).then(res => res.json())
			const approvestate = await fetch(
				`${leaderUrl}/channel/${id}/validator-messages/${dummyVals.ids.leader}/ApproveState`
			).then(res => res.json())
			t.equal(newstate.validatorMessages.length, 0, 'should delete all newstate validator messages')
			t.equal(
				approvestate.validatorMessages.length,
				0,
				'should delete all approvestate validator messages'
			)
		})
	)

	t.end()
})
// tape.on
tape.onFinish(() => process.exit())
