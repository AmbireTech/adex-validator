#!/usr/bin/env node

/**
 * Export ADX data to Biquery
 */
const fetch = require('node-fetch')
const { createDatasetIfNotExists, createTableIfNotExists, getTableClient } = require('./index')
const logger = require('../services/logger')('adx')
const { bigQueryTables } = require('../services/constants')

const id = 'adex'

const volumeSchema = [
	{ name: 'id', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'volume', type: 'NUMERIC', mode: 'REQUIRED' },
	{ name: 'timestamp', type: 'NUMERIC', mode: 'REQUIRED' }
]

const priceSchema = [
	{ name: 'id', type: 'STRING', mode: 'REQUIRED' },
	{ name: 'price', type: 'NUMERIC', mode: 'REQUIRED' },
	{ name: 'timestamp', type: 'NUMERIC', mode: 'REQUIRED' }
]

// @TODO With an API that gives access to historical exchange ADX volume
//
// const exchanges = ['binance', 'bittrex', 'upbit']

const BASE_URL = 'https://api.coingecko.com/api/v3/'

function normalizedDate() {
	return Math.floor(
		new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`).getTime() / 1000
	)
}

async function exportADXPriceAndVolume() {
	await createDatasetIfNotExists()
	await createTableIfNotExists(bigQueryTables.volume, volumeSchema)
	await createTableIfNotExists(bigQueryTables.price, priceSchema)

	const priceTable = getTableClient(bigQueryTables.price)
	const volumeTable = getTableClient(bigQueryTables.volume)

	const query = `SELECT created FROM ${bigQueryTables.stake} ORDER BY created DESC LIMIT 1`
	const [row] = await priceTable.query({ query })

	// Default is date for 10-01-2017, 1st of october 2017
	const from = (row && row.timestamp) || 1506812400
	const to = normalizedDate()

	// if()
	const PRICE_HISTORY_URL = `${BASE_URL}/coins/${id}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`

	// eslint-disable-next-line camelcase
	const { prices, total_volumes } = await fetch(PRICE_HISTORY_URL).then(r => r.json())

	const dailyPrices = prices.map(([timestamp, price]) => ({
		id: `${price}:${timestamp}`,
		price,
		timestamp
	}))

	const dailyVolumes = total_volumes.map(([timestamp, volume]) => ({
		id: `${volume}:${timestamp}`,
		volume,
		timestamp
	}))

	await Promise.all([priceTable.insert(dailyPrices), volumeTable.insert(dailyVolumes)])
}

exportADXPriceAndVolume().then(() => logger.info(`Finished export - ${new Date()}`))
