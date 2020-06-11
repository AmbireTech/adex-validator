#!/usr/bin/env node

/**
 * Export stake data to Biquery
 */

const { request } = require('graphql-request')
const {
	createDatasetIfNotExists,
	createTableIfNotExists,
	getTableClient,
	DATASET,
	PROJECT_ID
} = require('./index')
const logger = require('../services/logger')('stake')
const { bigQueryTables } = require('../services/constants')

const stakeSchema = [
	{ name: 'id', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'owner', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'amount', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'poolId', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'nonce', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'slashedAtStart', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'timestamp', type: 'NUMERIC', mode: 'REQUIRED' }
]

const THEGRAPH_API_URL =
	process.env.THEGRAPH_API_URL ||
	'https://api.thegraph.com/subgraphs/name/adexnetwork/adex-protocol'

async function stake() {
	await createDatasetIfNotExists()
	await createTableIfNotExists(bigQueryTables.stake, stakeSchema)
	const table = getTableClient(bigQueryTables.stake)
	const query = `SELECT timestamp FROM ${PROJECT_ID}.${DATASET}.${
		bigQueryTables.stake
	} ORDER BY timestamp DESC LIMIT 1`

	const [row] = await table.query({ query })

	// connect to
	// get last insert into db
	const lastUpdateTimestamp =
		(row.length && row[0].timestamp.toFixed(0)) || Math.floor(new Date(0).getTime() / 1000)

	const bondQuery = `
      query {
          bonds (where: {timestamp_gt: ${lastUpdateTimestamp}}) {
            id
            owner
            amount
            poolId
            nonce
            slashedAtStart
            timestamp
        }
      }
    `
	const data = await request(THEGRAPH_API_URL, bondQuery)

	if (data.bonds.length > 0) {
		await table.insert(data.bonds)
	}
	logger.info(`Inserted ${data.bonds.length} rows`)
}

stake().then(() => logger.info(`Finished stake data - ${new Date()}`))
