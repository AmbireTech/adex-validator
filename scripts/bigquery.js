require('dotenv').config()
const { BigQuery } = require('@google-cloud/bigquery')
const { getMongo, connect } = require('../db')
const { collections } = require('../services/constants')
const { getAdvancedReports } = require('../services/sentry/analyticsRecorder')

const REPORT_PUBLISHER_TO_ADUNIT_TABLE_NAME = 'reportPublisherToAdUnit'
const REPORT_PUBLISHER_TO_COUNTRY_TABLE_NAME = 'reportPublisherToCountry'
const BIGQUERY_RATE_LIMIT = 10 // There is a limit of ~ 2-10 min between delete and insert or changing schema
const DATASET_NAME = process.env.DATASET_NAME || 'development'
const options = {
	keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
	projectId: process.env.GOOGLE_CLOUD_PROJECT
}

const toNumericLimit = number => Number(number).toFixed(9)

let dataset = null

async function createReportPublisherToAdUnitTables() {
	// Create the dataset
	await dataset.createTable(REPORT_PUBLISHER_TO_ADUNIT_TABLE_NAME, {
		schema: {
			fields: [
				{ name: 'id', type: 'STRING', mode: 'REQUIRED' },
				{ name: 'adUnitId', type: 'STRING', mode: 'NULLABLE' },
				{ name: 'impressions', type: 'NUMERIC', mode: 'NULLABLE' },
				{ name: 'impressionsPayout', type: 'NUMERIC', mode: 'NULLABLE' },
				{ name: 'clicks', type: 'NUMERIC', mode: 'NULLABLE' },
				{ name: 'clicksPayout', type: 'NUMERIC', mode: 'NULLABLE' }
			]
		}
	})
	return startImport(
		REPORT_PUBLISHER_TO_ADUNIT_TABLE_NAME,
		await getMongo()
			.collection(collections.analyticsAggregate)
			.aggregate([{ $unwind: '$earners' }, { $group: { _id: '$earners' } }])
			.sort({ _id: -1 })
			.stream(),
		async function(publisher) {
			if (!publisher) return
			const { _id } = publisher
			const [impressions, clicks] = await Promise.all([
				getAdvancedReports({
					evType: 'IMPRESSION',
					publisher: _id
				}),
				getAdvancedReports({
					evType: 'CLICK',
					publisher: _id
				})
			])
			const results = []
			Object.entries(impressions.publisherStats.reportPublisherToAdUnit).forEach(([key, value]) => {
				results.push({
					id: _id,
					adUnitId: key,
					impressions: toNumericLimit(value || 0),
					impressionsPayout: toNumericLimit(
						impressions.publisherStats.reportPublisherToAdUnitPay[key] || 0
					),
					clicks: toNumericLimit(clicks.publisherStats.reportPublisherToAdUnit[key] || 0),
					clicksPayout: toNumericLimit(clicks.publisherStats.reportPublisherToAdUnitPay[key] || 0)
				})
			})
			// eslint-disable-next-line consistent-return
			return results
		}
	)
}

async function createReportPublisherToCountryTable() {
	// Create the dataset
	await dataset.createTable(REPORT_PUBLISHER_TO_COUNTRY_TABLE_NAME, {
		schema: {
			fields: [
				{ name: 'id', type: 'STRING', mode: 'REQUIRED' },
				{ name: 'countryCode', type: 'STRING', mode: 'NULLABLE' },
				{ name: 'impressions', type: 'NUMERIC', mode: 'NULLABLE' },
				{ name: 'impressionsPayout', type: 'NUMERIC', mode: 'NULLABLE' },
				{ name: 'clicks', type: 'NUMERIC', mode: 'NULLABLE' },
				{ name: 'clicksPayout', type: 'NUMERIC', mode: 'NULLABLE' }
			]
		}
	})
	return startImport(
		REPORT_PUBLISHER_TO_COUNTRY_TABLE_NAME,
		await getMongo()
			.collection(collections.analyticsAggregate)
			.aggregate([{ $unwind: '$earners' }, { $group: { _id: '$earners' } }])
			.sort({ _id: -1 })
			.stream(),
		async function(publisher) {
			if (!publisher) return
			const { _id } = publisher
			const [impressions, clicks] = await Promise.all([
				getAdvancedReports({
					evType: 'IMPRESSION',
					publisher: _id
				}),
				getAdvancedReports({
					evType: 'CLICK',
					publisher: _id
				})
			])
			const results = []
			Object.entries(impressions.publisherStats.reportPublisherToCountry).forEach(
				([key, value]) => {
					results.push({
						id: _id,
						countryCode: key,
						impressions: toNumericLimit(value || 0),
						impressionsPayout: toNumericLimit(
							impressions.publisherStats.reportPublisherToCountryPay[key] || 0
						),
						clicks: toNumericLimit(clicks.publisherStats.reportPublisherToCountry[key] || 0),
						clicksPayout: toNumericLimit(
							clicks.publisherStats.reportPublisherToCountryPay[key] || 0
						)
					})
				}
			)
			// eslint-disable-next-line consistent-return
			return results
		}
	)
}

async function deleteTableAndImport(websiteName, createTableFunc) {
	try {
		const [metaResponse] = await dataset.table(websiteName).getMetadata()
		const timeFromLastModifiedMs = +Date.now() - metaResponse.lastModifiedTime
		const timeLimitMs = 60 * BIGQUERY_RATE_LIMIT * 1000
		const timeToWaitMs = (timeLimitMs - timeFromLastModifiedMs) / 1000
		if (timeFromLastModifiedMs > timeLimitMs) {
			await dataset.table(websiteName).delete()
			console.log('deleted:', websiteName)
		} else {
			console.log(
				`You need to wait at least ${BIGQUERY_RATE_LIMIT} min to reinsert table => ${websiteName} | wait ${timeToWaitMs} seconds`
			)
			return false
		}
	} catch (error) {
		console.log(error.message)
	}
	return createTableFunc()
}

function importTables(cb) {
	Promise.all([
		deleteTableAndImport(
			REPORT_PUBLISHER_TO_ADUNIT_TABLE_NAME,
			createReportPublisherToAdUnitTables
		),
		deleteTableAndImport(
			REPORT_PUBLISHER_TO_COUNTRY_TABLE_NAME,
			createReportPublisherToCountryTable
		)
	])
		.then(() => process.exit(0))
		.catch(e => {
			console.log(e)
			process.exit(1)
		})
	cb()
}

async function init() {
	try {
		await connect()
		const bigqueryClient = new BigQuery(options)

		// Make sure there is a dataset with that name otherwise create it
		dataset = bigqueryClient.dataset(DATASET_NAME)
		const [datasetExists] = await dataset.exists()
		if (!datasetExists) {
			await dataset.create()
			dataset = bigqueryClient.dataset(DATASET_NAME)
		}

		// Create Tables
		await importTables(() => console.log('> initiated importTables'))
	} catch (error) {
		console.log(error.message)
		process.exit(1)
	}
}

function startImport(tableName, stream, map) {
	let ready = false
	let found = 0
	let done = 0
	let queue = []

	return new Promise((resolve, reject) => {
		stream.on('data', processObj)
		stream.on('end', async () => {
			ready = true
			const resolved = await checkReady()
			resolve(resolved)
		})
		stream.on('error', err => reject(err))
	})

	function processObj(data) {
		found += 1
		const mappedData = map(data)
		if (found - done > 20000) {
			stream.pause()
			flush()
		}

		if (!mappedData) {
			done += 1
			checkReady()
		}

		if (mappedData) {
			queue.push(mappedData)
		}

		if (queue.length > 100) flush()
	}

	async function flush() {
		const toInsert = [].concat(queue)
		try {
			queue = []
			const resolved = await Promise.all(toInsert)
			const flat = [].concat([], ...resolved)
			if (flat.length > 0) await dataset.table(tableName).insert(flat)
			done += toInsert.length
			return checkReady()
		} catch (e) {
			if (e && e.errors) {
				e.errors.slice(0, 4).forEach(singleError => {
					console.error('table.insert catch err', singleError)
				})
				if (e.errors.length > 6) console.log(`There are ${e.errors.length - 5} more errors...`)
			} else {
				console.error('table.insert catch', e)
			}
			return process.exit(1)
		}
	}

	// eslint-disable-next-line consistent-return
	function checkReady() {
		console.log(`DONE/${tableName}: ${done}`)
		if (ready && queue.length) return flush()
		if (ready && done === found) {
			return isReady()
		}
		if (found - done < 100) stream.resume()
	}

	function isReady() {
		console.log(`-> READY, IMPORTED ${done} ITEMS INTO BIGQUERY/${tableName}`)
		return true
	}
}

init()
