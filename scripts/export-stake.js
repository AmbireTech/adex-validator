#!/usr/bin/env node
/* eslint-disable no-underscore-dangle */

/**
 * Export stake data to Biquery
 */
const BN = require('bignumber.js')
const { request } = require('graphql-request')
const {
	createDatasetIfNotExists,
	createTableIfNotExists,
	getTableClient,
	DATASET_NAME,
	GOOGLE_CLOUD_PROJECT
} = require('./index')
const logger = require('../services/logger')('stake')
const { bigQueryTables } = require('../services/constants')

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
	{ name: 'status', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'slashedAtStart', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'timestamp', type: 'TIMESTAMP', mode: 'REQUIRED' },
	{ name: 'lastUpdateTimestamp', type: 'TIMESTAMP', mode: 'REQUIRED' }
]

const THEGRAPH_API_URL =
	process.env.THEGRAPH_API_URL ||
	'https://api.thegraph.com/subgraphs/name/adexnetwork/adex-protocol'

async function stake() {
	await createDatasetIfNotExists()
	await createTableIfNotExists(bigQueryTables.stake, stakeSchema)

	const table = getTableClient(bigQueryTables.stake)
	const query = `SELECT lastUpdateTimestamp FROM ${GOOGLE_CLOUD_PROJECT}.${DATASET_NAME}.${
		bigQueryTables.stake
	} ORDER BY lastUpdateTimestamp DESC LIMIT 1`

	const [row] = await table.query({ query })

	// connect to
	// get last insert into db
	const lastFetchTimestamp =
		(row.length && Math.floor(new Date(row[0].lastUpdateTimestamp.value).getTime() / 1000)) ||
		Math.floor(new Date(0).getTime() / 1000)

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
				bondId
			  }
		  }
      }
    `
	const { stakingTransactions } = await request(THEGRAPH_API_URL, bondQuery)

	let unbonds = stakingTransactions.filter(
		tx => tx.__typename === 'UnBond' || tx.__typename === 'UnbondRequest'
	)
	const bonds = stakingTransactions
		.filter(tx => tx.__typename === 'Bond')
		.map(({ amount, bondId, id, nonce, owner, poolId, slashedAtStart, timestamp, __typename }) => {
			let status = __typename.toLowerCase()
			let lastUpdateTimestamp = timestamp
			// convert to number
			const nAmount = new BN(amount).dividedBy(new BN(10).exponentiatedBy(new BN(18))).toFixed(12)
			// Find if any transactions in unbonds interact with this bondId
			// and apply the tx before inserting
			// this is due to restriction by BigQuery to not
			// modify recently inserted data when the table is streaming
			const modifyingTx = unbonds.filter(tx => tx.bondId === bondId)

			if (modifyingTx.length > 0) {
				unbonds = unbonds.filter(tx => tx.bondId !== bondId)

				modifyingTx.forEach(tx => {
					status = tx.__typename.toLowerCase()
					lastUpdateTimestamp = tx.timestamp
				})
			}

			return {
				amount: nAmount,
				bondId,
				id,
				nonce,
				owner,
				poolId,
				slashedAtStart,
				status,
				timestamp,
				lastUpdateTimestamp
			}
		})

	if (bonds.length > 0) {
		await table.insert(bonds).catch(e => logger.error(e.errors[0]))
	}

	if (unbonds.length > 0) {
		// create update queries
		const queries = unbonds.map(unbond =>
			table.query({
				query: `UPDATE ${GOOGLE_CLOUD_PROJECT}.${DATASET_NAME}.${
					bigQueryTables.stake
				} SET status = "${unbond.__typename.toLowerCase()}", lastUpdateTimestamp = "${new Date(
					unbond.timestamp * 1000
				).toJSON()}"  WHERE bondId = "${unbond.bondId}"  `
			})
		)
		await Promise.all(queries)
	}

	logger.info(`Inserted ${stakingTransactions.length} rows`)
}

stake().then(() => logger.info(`Finished stake data - ${new Date()}`))
