#!/usr/bin/env node
const tape = require('tape-catch')
const db = require('../db').connect()
const { exec } = require('./lib')

tape('prune validator messages', async function(t) {
	// execute prune script
	await exec(
		`../scripts/prune.js DB_MONGO_NAME=${
			process.env.DB_MONGO_NAME
		} THRESHOLD=${Date.now()} CHANNEL=${process.env}`
	)
	const validatorCol = db.getMongo().collection('validatorMessages')
	validatorCol.find().then(function(result) {
		t.equal(result.length === 2, 'successfully pruned validator messsages')
	})
})
