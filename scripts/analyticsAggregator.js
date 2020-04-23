#!/usr/bin/env node

const BN = require('bn.js')
const db = require('../db')
const { sumBNValues } = require('../services')
const { database } = require('../services/constants')
// TIME Interval in seconds
// default 300 == 5 mins
const TIME_INTERVAL = parseInt(process.env.TIME_INTERVAL, 10) || 5 * 60

// eslint-disable-next-line no-console
const log = console.log

async function aggregate() {
	await db.connect()
	// enter the eventAggregates collection
	// produce a new aggregate per channel
	const analyticsCol = db.getMongo().collection(database.analyticsAggregate)
	const eventsCol = db.getMongo().collection(database.eventAggregates)

	const lastAggr = await analyticsCol.findOne().sort({ created: -1 })
	const start = (lastAggr && lastAggr.created) || new Date(0)

	const pipeline = [
		{ $match: { created: { $gt: start } } },
		{
			$group: {
				_id: {
					time: {
						$subtract: [{ $toLong: '$created' }, { $mod: [{ $toLong: '$created' }, TIME_INTERVAL] }]
					},
					channelId: '$channelId'
				},
				aggr: { $mergeObjects: '$events' }
			}
		},
		{ $sort: { _id: 1, channelId: 1, created: 1 } }
	]

	const data = await eventsCol.aggregate(pipeline).toArray()

	// console.log({ data })

	// "events" : { "IMPRESSION" : { "eventCounts" : { "0xb7d3f81e857692d13e9d63b232a90f4a1793189e" : "60" }, "eventPayouts" : { "0xb7d3f81e857692d13e9d63b232a90f4a1793189e" : "60" } } }

	// process the data and store in analyticsCol
	// generate 5 mins bounds and aggregate data within this period and store
	await Promise.all(
		data.map(async item => {
			const events = {}
			const totals = {}
			item.aggr.forEach(evAggr => {
				Object.keys(evAggr).forEach(evType => {
					const { eventCounts, eventPayouts } = evAggr[evType]

					totals[evType].eventCounts = sumBNValues(eventCounts)
					totals[evType].eventPayouts = sumBNValues(eventPayouts)

					Object.keys(eventCounts).forEach(publisher => {
						// if it exists in eventCounts then it exists in payouts
						if (events[evType] && events[evType].eventCounts[publisher]) {
							// sum
							events[evType].eventCounts[publisher] = new BN(eventCounts[publisher])
								.add(new BN(events[evType].eventCounts[publisher]))
								.toString()
							events[evType].eventPayouts[publisher] = new BN(eventPayouts[publisher])
								.add(new BN(events[evType].eventPayouts[publisher]))
								.toString()
						} else {
							events[evType].eventCounts[publisher] = eventCounts[publisher]
							events[evType].eventPayouts[publisher] = eventPayouts[publisher]
						}
					})
				})
			})

			// persist
			return analyticsCol.insertOne({
				...item,
				events,
				totals
			})
		})
	)
}

aggregate().then(() => log(`Finsished processesing ${new Date()}`))
