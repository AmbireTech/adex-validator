#!/usr/bin/env node
/* eslint-disable no-underscore-dangle */

/**
 * Export stake data to Biquery
 */
const BN = require('bn.js')
const { request } = require('graphql-request')
const {
	bigQueryTables,
	createDatasetIfNotExists,
	createTableIfNotExists,
	getTableClient,
	DATASET_NAME,
	GOOGLE_CLOUD_PROJECT
} = require('./index')
const logger = require('../services/logger')('stake')

const stakeSchema = [
	{ name: 'id', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'owner', type: 'STRING', mode: 'REQUIRED' },
	// NUMERIC only supports 9 decimal places
	// We need more than 9 decimal places else we would have
	// lots of zeros due to approximating to 9 decimal places
	{ name: 'amount', type: 'FLOAT64', mode: 'REQUIRED' },
	{ name: 'poolId', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'bondId', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'nonce', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'slashedAtStart', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'timestamp', type: 'TIMESTAMP', mode: 'REQUIRED' }
]

const unbondSchema = [
	{ name: 'id', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'owner', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'bondId', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'timestamp', type: 'TIMESTAMP', mode: 'REQUIRED' }
]

const unbondRequestSchema = [
	{ name: 'id', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'owner', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'bondId', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'willunlock', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'timestamp', type: 'TIMESTAMP', mode: 'REQUIRED' }
]

const THEGRAPH_API_URL =
	process.env.THEGRAPH_API_URL ||
	'https://api.thegraph.com/subgraphs/name/adexnetwork/adex-protocol'

async function getLastInsertTimestamp(tableId) {
	const table = getTableClient(bigQueryTables.stake)
	const query = `SELECT timestamp FROM ${GOOGLE_CLOUD_PROJECT}.${DATASET_NAME}.${tableId} ORDER BY timestamp DESC LIMIT 1`
	const [row] = await table.query({ query })
	return (
		(row.length && Math.floor(new Date(row[0].timestamp.value).getTime() / 1000)) ||
		Math.floor(new Date(0).getTime() / 1000)
	)
}

async function stake() {
	await createDatasetIfNotExists()
	await createTableIfNotExists(bigQueryTables.stake, stakeSchema)
	await createTableIfNotExists(bigQueryTables.unbond, unbondSchema)
	await createTableIfNotExists(bigQueryTables.unbondRequest, unbondRequestSchema)

	const stakeTimestamp = await getLastInsertTimestamp(bigQueryTables.stake)
	const unbondTimestamp = await getLastInsertTimestamp(bigQueryTables.unbond)
	const unbondRequestTimestamp = await getLastInsertTimestamp(bigQueryTables.unbondRequest)

	const lastFetchTimestamp =
		stakeTimestamp > unbondTimestamp
			? Math.max(stakeTimestamp, unbondRequestTimestamp)
			: Math.max(unbondRequestTimestamp, unbondTimestamp)

	const bondQuery = `
      query {
		  stakingTransactions(first: 100, orderBy: timestamp, where: {timestamp_gt: ${lastFetchTimestamp}}) {
			  timestamp
			  __typename

			  ... on Bond {
				id
				bondId
				owner
				amount
				poolId
				nonce
				slashedAtStart
			  }

			  ... on Unbond {
				id
				owner
				bondId
			  }

			  ... on UnbondRequest {
				id
				owner
				willUnlock
				bondId
			  }
		  }
      }
    `
	const { stakingTransactions } = await request(THEGRAPH_API_URL, bondQuery)

	const unbonds = stakingTransactions
		.filter(tx => tx.__typename === 'Unbond')
		.map(({ bondId, id, owner, timestamp }) => ({
			bondId,
			id,
			owner,
			timestamp
		}))

	const unbondRequest = stakingTransactions
		.filter(tx => tx.__typename === 'UnbondRequest')
		.map(({ bondId, id, owner, timestamp, willUnlock }) => ({
			bondId,
			id,
			owner,
			timestamp,
			willunlock: willUnlock
		}))

	const bonds = stakingTransactions
		.filter(tx => tx.__typename === 'Bond')
		.map(({ amount, bondId, id, nonce, owner, poolId, slashedAtStart, timestamp }) => {
			// convert to number
			const nAmount = (parseInt(new BN(amount).toString(), 10) / 10 ** 18).toFixed(12)
			return {
				amount: nAmount,
				bondId,
				id,
				nonce,
				owner,
				poolId,
				slashedAtStart,
				timestamp
			}
		})

	if (bonds.length > 0) {
		await getTableClient(bigQueryTables.stake)
			.insert(bonds)
			.catch(e => logger.error(e.errors[0]))
	}

	if (unbonds.length > 0) {
		await getTableClient(bigQueryTables.unbond)
			.insert(unbonds)
			.catch(e => logger.error(e.errors[0]))
	}

	if (unbondRequest.length > 0) {
		await getTableClient(bigQueryTables.unbondRequest)
			.insert(unbondRequest)
			.catch(e => logger.error(e.errors[0]))
	}

	logger.info(`Inserted ${stakingTransactions.length} rows`)
}

stake().then(() => logger.info(`Finished stake data - ${new Date()}`))
