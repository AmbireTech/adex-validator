const { BigQuery } = require('@google-cloud/bigquery')
const logger = require('../services/logger')('bigquery')

const DATASET_NAME = process.env.DATASET_NAME || 'adex'
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'adex-275614'
const bigQueryClient = new BigQuery()

async function createDatasetIfNotExists() {
	const [datasetExists] = await bigQueryClient.dataset(DATASET_NAME).exists()
	if (!datasetExists) {
		const dataset = await bigQueryClient.createDataset(DATASET_NAME)
		logger.info(`Dataset ${dataset.id} created.`)
	}
}

async function createTableIfNotExists(tableId, schema) {
	const [exists] = await bigQueryClient
		.dataset(DATASET_NAME)
		.table(tableId)
		.exists()

	if (!exists) {
		const [table] = await bigQueryClient.dataset(DATASET_NAME).createTable(tableId, { schema })
		logger.info(`Table ${table.id} created.`)
	}
}

const getTableClient = tableId => bigQueryClient.dataset(DATASET_NAME).table(tableId)

module.exports = {
	DATASET_NAME,
	GOOGLE_CLOUD_PROJECT,
	getTableClient,
	createDatasetIfNotExists,
	createTableIfNotExists,
	bigQueryClient
}
