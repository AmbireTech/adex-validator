require('dotenv').config()
const BN = require('bn.js')
const { BigQuery } = require('@google-cloud/bigquery')
const { getMongo, connect } = require('../db')
const { sumBNValues } = require('../services')
const { collections } = require('../services/constants')

// make sure you use the corresponding market to the db you use
const WEBSITES_TABLE_NAME = 'websites2'
const BIGQUERY_RATE_LIMIT = 10 // There is a limit of ~ 2-10 min between delete and insert
const TIME_INTERVAL = parseInt(process.env.TIME_INTERVAL, 10) * 60 * 1000 || 60 * 60 * 1000
// const LIMIT = parseInt(process.env.LIMIT, 10) || 10000
const DATASET_NAME = process.env.DATASET_NAME || 'development'
const options = {
	keyFilename: './credentials/adex-bigquery.json', // gitignored folder
	projectId: process.env.GOOGLE_CLOUD_PROJECT
}

let dataset = null

async function createWebsitesTable() {
	const analyticsCol = getMongo().collection(collections.analyticsAggregate)
	const eventsCol = getMongo().collection(collections.eventAggregates)

	const pipeline = [
		{
			$group: {
				_id: {
					time: {
						$subtract: [{ $toLong: '$created' }, { $mod: [{ $toLong: '$created' }, TIME_INTERVAL] }]
					},
					channelId: '$channelId'
				},
				aggr: { $push: '$events' },
				earners: { $push: '$earners' },
				lastUpdateTimestamp: { $max: '$created' }
			}
		},
		{
			$addFields: {
				earners: {
					$reduce: {
						input: '$earners',
						initialValue: [],
						in: { $setUnion: ['$$value', '$$this'] }
					}
				}
			}
		}
	]

	const data = await eventsCol.aggregate(pipeline).toArray()
	const mappedData = await Promise.all(
		data.map(async ({ aggr, _id, earners, lastUpdateTimestamp }) => {
			const analyticDoc = (await analyticsCol.findOne({ _id: `${_id.channelId}:${_id.time}` })) || {
				_id: `${_id.channelId}:${_id.time}`,
				channelId: _id.channelId,
				created: new Date(_id.time),
				earners: [],
				events: {},
				totals: {},
				lastUpdateTimestamp
			}

			// update lastUpdateTimestamp
			analyticDoc.lastUpdateTimestamp = lastUpdateTimestamp
			// merge earners and remove duplicates
			analyticDoc.earners.push(...earners)
			analyticDoc.earners = analyticDoc.earners.filter(
				(a, b) => analyticDoc.earners.indexOf(a) === b
			)

			aggr.forEach(evAggr => {
				Object.keys(evAggr).forEach(evType => {
					const { eventCounts, eventPayouts } = evAggr[evType]

					analyticDoc.totals[evType] = {
						eventCounts: new BN(
							(analyticDoc.totals[evType] && analyticDoc.totals[evType].eventCounts) || '0'
						)
							.add(sumBNValues(eventCounts))
							.toString(),
						eventPayouts: new BN(
							(analyticDoc.totals[evType] && analyticDoc.totals[evType].eventPayouts) || '0'
						)
							.add(sumBNValues(eventPayouts))
							.toString()
					}

					Object.keys(eventCounts).forEach(publisher => {
						// if it exists in eventCounts then it exists in payouts
						if (analyticDoc.events[evType] && analyticDoc.events[evType].eventCounts[publisher]) {
							analyticDoc.events[evType].eventCounts[publisher] = new BN(eventCounts[publisher])
								.add(new BN(analyticDoc.events[evType].eventCounts[publisher]))
								.toString()
							analyticDoc.events[evType].eventPayouts[publisher] = new BN(eventPayouts[publisher])
								.add(new BN(analyticDoc.events[evType].eventPayouts[publisher]))
								.toString()
						} else {
							analyticDoc.events[evType] = {
								eventCounts: {
									...(analyticDoc.events[evType] && analyticDoc.events[evType].eventCounts),
									[publisher]: eventCounts[publisher]
								},
								eventPayouts: {
									...(analyticDoc.events[evType] && analyticDoc.events[evType].eventPayouts),
									[publisher]: eventPayouts[publisher]
								}
							}
						}
					})
				})
			})
			return analyticDoc
		})
	)
	console.log(JSON.stringify(mappedData, null, 4))
	// Create the dataset
	// await dataset.createTable(WEBSITES_TABLE_NAME, {
	// 	schema: {
	// 		fields: [
	// 			{ name: 'id', type: 'STRING', mode: 'REQUIRED' },
	// 			{ name: 'hostname', type: 'STRING', mode: 'REQUIRED' },
	// 			{ name: 'publisher', type: 'STRING', mode: 'REQUIRED' },
	// 			{ name: 'created', type: 'TIMESTAMP', mode: 'NULLABLE' },
	// 			{ name: 'updated', type: 'TIMESTAMP', mode: 'NULLABLE' },
	// 			{ name: 'verifiedForce', type: 'BOOL', mode: 'NULLABLE' },
	// 			{ name: 'verifiedIntegration', type: 'BOOL', mode: 'NULLABLE' },
	// 			{ name: 'verifiedOwnership', type: 'BOOL', mode: 'NULLABLE' },
	// 			{ name: 'websiteUrl', type: 'STRING', mode: 'NULLABLE' },
	// 			{ name: 'rank', type: 'INT64', mode: 'NULLABLE' },
	// 			{ name: 'reachPerMillion', type: 'FLOAT64', mode: 'NULLABLE' },
	// 			{ name: 'webshrinkerCategories', type: 'STRING', mode: 'REPEATED' }
	// 		]
	// 	}
	// })
	// return startImport(
	// 	WEBSITES_TABLE_NAME,
	// 	getMongo()
	// 		.collection('websites')
	// 		.find()
	// 		.sort({ _id: -1 })
	// 		.stream(),
	// 	function(website) {
	// 		if (!website) return false
	// 		return {
	// 			id: website.id.toString(),
	// 			hostname: website.hostname.toString(),
	// 			publisher: website.publisher.toString(),
	// 			created: website.created ? parseInt(new Date(website.created).getTime() / 1000, 10) : null,
	// 			updated: website.updated ? parseInt(new Date(website.created).getTime() / 1000, 10) : null,
	// 			verifiedForce: website.verifiedForce,
	// 			verifiedIntegration: website.verifiedIntegration,
	// 			websiteUrl: website.websiteUrl,
	// 			rank: website.rank,
	// 			reachPerMillion: parseFloat(website.reachPerMillion),
	// 			webshrinkerCategories: website.webshrinkerCategories || []
	// 		}
	// 	}
	// )
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
	Promise.all([deleteTableAndImport(WEBSITES_TABLE_NAME, createWebsitesTable)]).then(() =>
		process.exit(0)
	)
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

// function startImport(tableName, stream, map) {
// 	let ready = false
// 	let found = 0
// 	let done = 0
// 	let queue = []

// 	return new Promise((resolve, reject) => {
// 		stream.on('data', processObj)
// 		stream.on('end', async () => {
// 			ready = true
// 			const success = await checkReady()
// 			if (success) {
// 				// Check this
// 				resolve(success)
// 			}
// 		})
// 		stream.on('error', err => reject(err))
// 	})

// 	function processObj(data) {
// 		found += 1
// 		const mappedData = map(data)

// 		if (found - done > 20000) {
// 			stream.pause()
// 			flush()
// 		}

// 		if (!mappedData) {
// 			done += 1
// 			checkReady()
// 		}

// 		if (mappedData) {
// 			queue.push(mappedData)
// 		}

// 		if (queue.length > 150) flush()
// 	}

// 	async function flush() {
// 		const toInsert = [].concat(queue)
// 		try {
// 			queue = []
// 			const resolved = await Promise.all(toInsert)
// 			await dataset.table(tableName).insert(resolved)
// 			done += toInsert.length
// 			return checkReady()
// 		} catch (e) {
// 			if (e && e.errors) {
// 				e.errors.forEach(singleError => {
// 					console.error('table.insert catch err', singleError)
// 				})
// 			} else {
// 				console.error('table.insert catch', e)
// 			}
// 			return false
// 		}
// 	}

// 	function checkReady() {
// 		console.log(`DONE/${tableName}: ${done}`)
// 		if (ready && queue.length) return flush()
// 		if (ready && done === found) {
// 			return isReady()
// 		}
// 		if (found - done < 100) stream.resume()
// 	}

// 	function isReady() {
// 		console.log(`-> READY, IMPORTED ${done} ITEMS INTO BIGQUERY/${tableName}`)
// 		return true
// 	}
// }

init()
