#!/usr/bin/env node
/**
 * Export eventAggregates data to Biquery
 */
const { BigQuery } = require('@google-cloud/bigquery')
const db = require('../db')
const logger = require('../services/logger')('evAggr')
const { collections } = require('../services/constants')

const DATASET = process.env.DATASET || 'adex'
const schema = [
	{ name: 'channelId', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'created', type: 'Date', mode: 'REQUIRED' },
	{ name: 'event_type', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'earner', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'count', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'payout', type: 'STRING', mode: 'REQUIRED' }
]

async function exportData() {
	const analyticsCol = db.getMongo().collection(collections.analyticsAggregate)
	const bigQueryClient = new BigQuery() // missing api key
	const [datasetExists] = await bigQueryClient.dataset(DATASET).exists()
	if (!datasetExists) {
		const dataset = await bigQueryClient.createDataset(DATASET)
		logger.info(`Dataset ${dataset.id} created.`)
	}

	const [exists] = await bigQueryClient
		.dataset(DATASET)
		.table(collections.analyticsAggregat)
		.exists()

	if (!exists) {
		const [table] = await bigQueryClient
			.dataset(DATASET)
			.createTable(collections.analyticsAggregate, schema)
		logger.info(`Table ${table.id} created.`)
	}

	const table = bigQueryClient.dataset(DATASET).table(collections.analyticsAggregate)
	const query = `SELECT created FROM \`${
		collections.analyticsAggregate
	}\` ORDER BY created DESC LIMIT 1`

	const [row] = await table.query({ query })
	// fetch data from mongodb
	const data = await analyticsCol
		.find({ created: { $gt: (row && row.created) || new Date(0) } })
		.toArray()

	// insert into BigQuery
	await table.insert(expandDocs(data))

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
exportData().then(() => logger.info(`Finished export - ${new Date()}`))
