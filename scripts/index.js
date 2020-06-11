const { BigQuery } = require('@google-cloud/bigquery')
const logger = require('../services/logger')('bigquery')

const DATASET = process.env.DATASET || 'adex'
const PROJECT_ID = process.env.PROJECT_ID || 'adex-275614'
const bigQueryClient = new BigQuery() // missing api key

async function createDatasetIfNotExists() {
	const [datasetExists] = await bigQueryClient.dataset(DATASET).exists()
	if (!datasetExists) {
		const dataset = await bigQueryClient.createDataset(DATASET)
		logger.info(`Dataset ${dataset.id} created.`)
	}
}

async function createTableIfNotExists(tableId, schema) {
	const [exists] = await bigQueryClient
		.dataset(DATASET)
		.table(tableId)
		.exists()

	if (!exists) {
		const [table] = await bigQueryClient.dataset(DATASET).createTable(tableId, { schema })
		logger.info(`Table ${table.id} created.`)
	}
}

const getTableClient = tableId => bigQueryClient.dataset(DATASET).table(tableId)

module.exports = {
	DATASET,
	PROJECT_ID,
	getTableClient,
	createDatasetIfNotExists,
	createTableIfNotExists,
	bigQueryClient
}
