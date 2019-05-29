#!/usr/bin/env node

const tape = require('tape-catch')
const fetch = require('node-fetch')
const { exec } = require('./lib')
const dummyVals = require('./prep-db/mongo')

const leaderUrl = dummyVals.channel.spec.validators[0].url

tape('prune.sh: prune heartbeat messages', async t => {
	const { DB_MONGO_NAME } = process.env
	const id = dummyVals.channel.id
	await exec(`./scripts/prune.sh -channel ${id} -database ${DB_MONGO_NAME}`)
	const messages = await fetch(`${leaderUrl}/channel/${id}/validator-messages?type=Heartbeat`).then(
		res => res.json()
	)
	t.ok(
		messages.validatorMessages.length > 0,
		'should not prune heartbeat messages greater than timestamp '
	)
	t.end()
})

tape('prune.sh: prune validator messages for expired channels', async t => {
	const { DB_MONGO_NAME } = process.env
	const id = dummyVals.channel.id
	await exec(`./scripts/prune.sh -channel ${id} -database ${DB_MONGO_NAME} -expired true`)
	const messages = await fetch(`${leaderUrl}/channel/${id}/validator-messages?type=Heartbeat`).then(
		res => res.json()
	)
	t.equal(messages.validatorMessages.length, 0, 'should delete all validator messages')
	t.end()
})
