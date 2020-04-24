#!/usr/bin/env node

const tape = require('tape-catch')
const { exec } = require('./lib')
const db = require('../db')
const { database } = require('../services/constants')
// connect to database
db.connect()

tape('analyticsAggregator: aggregate', async t => {
	// post eventAggregates multiple times
	// run the aggregate
	// fetch the result and compare
	const { DB_MONGO_NAME } = process.env
	await exec(`DB_MONGO_NAME='${DB_MONGO_NAME}' ./scripts/analyticsAggregator.js`)

	const eventCol = await db
		.getMongo()
		.collection(database.eventAggregates)
		.countDocuments()

	const aggrCol = await db
		.getMongo()
		.collection(database.analyticsAggregate)
		.countDocuments()

	const eventAggr = await db
		.getMongo()
		.collection(database.eventAggregates)
		.findOne()
	const analyticAggr = await db
		.getMongo()
		.collection(database.eventAggregates)
		.findOne()

	t.deepEqual(
		Object.keys(eventAggr),
		Object.keys(analyticAggr),
		'should have the same db structure'
	)
	t.ok(eventCol > aggrCol, 'should perform reduce aggregation')
	t.end()
})

tape.onFinish(() => db.close().then(() => console.log(`close db connection`)))
