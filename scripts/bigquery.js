require('dotenv').config()
const { BigQuery } = require('@google-cloud/bigquery')
const { getMongo, connect } = require('../db')
const { collections } = require('../services/constants')
const { getAdvancedReports } = require('../services/sentry/analyticsRecorder')

// make sure you use the corresponding market to the db you use
const ADVANCED_ANALYTICS_TABLE_NAME = 'reportPublisherToAdUnit2'
const BIGQUERY_RATE_LIMIT = 10 // There is a limit of ~ 2-10 min between delete and insert
const DATASET_NAME = process.env.DATASET_NAME || 'advancedAnalytics'
const options = {
	keyFilename: './credentials/adex-bigquery.json', // gitignored folder
	projectId: process.env.GOOGLE_CLOUD_PROJECT
}

let dataset = null

async function createWebsitesTable() {
	// Create the dataset
	try {
		// await dataset.createTable(ADVANCED_ANALYTICS_TABLE_NAME, {
		// 	schema: {
		// 		fields: [
		// 			{ name: 'id', type: 'STRING', mode: 'REQUIRED' },
		// 			{ name: 'adUnitId', type: 'STRING', mode: 'NULLABLE' },
		// 			{ name: 'impressions', type: 'NUMERIC', mode: 'NULLABLE' },
		// 			{ name: 'impressionsPayout', type: 'FLOAT64', mode: 'NULLABLE' },
		// 			{ name: 'clicks', type: 'NUMERIC', mode: 'NULLABLE' },
		// 			{ name: 'clicksPayout', type: 'FLOAT64', mode: 'NULLABLE' }
		// 		]
		// 	}
		// })
		const publishers = await getMongo()
			.collection(collections.analyticsAggregate)
			.distinct('earners')
		const impressions = []
		const clicks = []
		publishers.forEach(id => {
			impressions.push(
				getAdvancedReports({
					evType: 'IMPRESSION',
					publisher: id
				})
			)
			clicks.push(
				getAdvancedReports({
					evType: 'CLICK',
					publisher: id
				})
			)
		})
		const [impressionsResolved, clicksResolved] = await Promise.all([
			Promise.all(impressions),
			Promise.all(clicks)
		])
		const toInsert = []
		impressionsResolved
			.map(r => ({
				id: r.publisher,
				publisherStats: r.publisherStats
			}))
			.forEach(i => {
				Object.entries(i.publisherStats.reportPublisherToAdUnit).forEach(([key, value]) => {
					const clickStats = clicksResolved.find(p => p.publisher === i.id)
					toInsert.push({
						id: i.id,
						adUnitId: key,
						impressions: value || 0,
						impressionsPayout: i.publisherStats.reportPublisherToAdUnitPay[key] || 0,
						clicks: clickStats.publisherStats.reportPublisherToAdUnit[key] || 0,
						clicksPayout: clickStats.publisherStats.reportPublisherToAdUnitPay[key] || 0
					})
				})
			})
		// TODO: batch insert less then 2000
		await dataset.table(ADVANCED_ANALYTICS_TABLE_NAME).insert(toInsert)
		console.log(toInsert)
	} catch (e) {
		if (e && e.errors) {
			e.errors.forEach(singleError => {
				console.error('table.insert catch err', singleError)
			})
		} else {
			console.error('table.insert catch', e)
		}
		process.exit(1)
	}
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
	Promise.all([deleteTableAndImport(ADVANCED_ANALYTICS_TABLE_NAME, createWebsitesTable)])
		.then(() => process.exit(0))
		.catch(e => console.log(e))
	cb()
}

async function init() {
	try {
		await connect()
		const bigqueryClient = new BigQuery(options)

		// Make sure there is a dataset with that name otherwise create it
		dataset = bigqueryClient.dataset(DATASET_NAME)
		const [datasetExists] = await dataset.exists()
		if (!datasetExists) dataset = await dataset.create()

		// Create Tables
		await importTables(() => console.log('> initiated importTables'))
	} catch (error) {
		console.log(error.message)
		process.exit(1)
	}
}

init()
