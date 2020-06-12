#!/usr/bin/env node

/**
 * Export eventAggregates data to Biquery
 */

const {
	createDatasetIfNotExists,
	createTableIfNotExists,
	getTableClient,
	DATASET,
	PROJECT_ID
} = require('./index')
const db = require('../db')
const logger = require('../services/logger')('evAggr')
const { bigQueryTables, collections } = require('../services/constants')

const schema = [
	{ name: 'channelId', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'created', type: 'TIMESTAMP', mode: 'REQUIRED' },
	{ name: 'event_type', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'earner', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'count', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'payout', type: 'STRING', mode: 'REQUIRED' }
]

async function exportData() {
	await createDatasetIfNotExists()
	await createTableIfNotExists(bigQueryTables.analytics, schema)

	const table = getTableClient(bigQueryTables.analytics)
	const query = `SELECT created FROM \`${PROJECT_ID}.${DATASET}.${
		bigQueryTables.analytics
	}\` ORDER BY created DESC LIMIT 1`

	const [row] = await table.query({ query })

	// fetch data from mongodb
	const analyticsCol = db.getMongo().collection(collections.analyticsAggregate)

	const data = await analyticsCol
		.find({ created: { $gt: (row.length && new Date(row[0].created.value)) || new Date(0) } })
		.toArray()

	// insert into BigQuery
	const rows = expandDocs(data)
	if (rows.length) await table.insert(rows)

	logger.info(`Inserted ${data.length} rows`)
}

function expandDocs(docs) {
	const result = []
	// eslint-disable-next-line no-restricted-syntax
	for (const aggr of docs) {
		const eventTypes = Object.keys(aggr.events)
		eventTypes.forEach(eventType => {
			const { eventCounts, eventPayouts } = aggr.events[eventType]
			const data = Object.keys(eventCounts).map(earner => ({
				channelId: aggr.channelId,
				created: aggr.created,
				event_type: eventType,
				earner,
				count: eventCounts[earner],
				payout: eventPayouts[earner]
			}))
			result.push(...data)
		})
	}
	return result
}

db.connect().then(() => exportData().then(() => logger.info(`Finished export - ${new Date()}`)))
