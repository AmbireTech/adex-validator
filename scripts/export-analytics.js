#!/usr/bin/env node

/**
 * Export eventAggregates data to Biquery
 */
const BN = require('bn.js')
const {
	bigQueryTables,
	createDatasetIfNotExists,
	createTableIfNotExists,
	getTableClient,
	DATASET_NAME,
	GOOGLE_CLOUD_PROJECT
} = require('./index')
const db = require('../db')
const logger = require('../services/logger')('evAggr')
const { collections } = require('../services/constants')

const schema = [
	{ name: 'channelId', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'created', type: 'TIMESTAMP', mode: 'REQUIRED' },
	{ name: 'event_type', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'earner', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'count', type: 'NUMERIC', mode: 'REQUIRED' },
	{ name: 'payout', type: 'NUMERIC', mode: 'REQUIRED' }
]

async function exportData() {
	await createDatasetIfNotExists()
	await createTableIfNotExists(bigQueryTables.analytics, schema)

	const table = getTableClient(bigQueryTables.analytics)
	const query = `SELECT created FROM \`${GOOGLE_CLOUD_PROJECT}.${DATASET_NAME}.${
		bigQueryTables.analytics
	}\` ORDER BY created DESC LIMIT 1`

	const [row] = await table.query({ query })

	// fetch data from mongodb
	const analyticsCol = db.getMongo().collection(collections.analyticsAggregate)

	const cur = analyticsCol.find(
		{
			created: { $gt: (row.length && new Date(row[0].created.value)) || new Date(0) }
		},
		{ timeout: false }
	)

	let data
	let total = 0
	// eslint-disable-next-line no-cond-assign, no-await-in-loop
	while ((data = await cur.next())) {
		// insert into BigQuery
		const rows = expandDocs(data)
		if (rows.length) {
			total += rows.length
			// eslint-disable-next-line no-await-in-loop
			await table.insert(rows)
		}
	}

	logger.info(`Inserted ${total} rows`)
}

function expandDocs(aggr) {
	const result = []

	const eventTypes = Object.keys(aggr.events)
	eventTypes.forEach(eventType => {
		const { eventCounts, eventPayouts } = aggr.events[eventType]
		const data = Object.keys(eventCounts).map(earner => ({
			channelId: aggr.channelId,
			created: aggr.created,
			event_type: eventType,
			earner,
			count: parseInt(new BN(eventCounts[earner]).toString(), 10),
			payout: (parseInt(new BN(eventPayouts[earner]).toString(), 10) / 10 ** 18).toFixed(8)
		}))
		result.push(...data)
	})

	return result
}

db.connect().then(() =>
	exportData().then(() => {
		logger.info(`Finished export - ${new Date()}`)
		process.exit(0)
	})
)
