const { BigQuery } = require('@google-cloud/bigquery')
const logger = require('../services/logger')('evAggr')

const DATASET = process.env.DATASET || 'adex'
export const bigQueryClient = new BigQuery() // missing api key

export async function createDatasetIfNotExists() {
	const [datasetExists] = await bigQueryClient.dataset(DATASET).exists()
	if (!datasetExists) {
		const dataset = await bigQueryClient.createDataset(DATASET)
		logger.info(`Dataset ${dataset.id} created.`)
	}
}

export async function createTableIfNotExists(tableId, schema) {
	const [exists] = await bigQueryClient
		.dataset(DATASET)
		.table(tableId)
		.exists()

	if (!exists) {
		const [table] = await bigQueryClient.dataset(DATASET).createTable(tableId, schema)
		logger.info(`Table ${table.id} created.`)
	}
}

export const getTableClient = tableId => bigQueryClient.dataset(DATASET).table(tableId)
