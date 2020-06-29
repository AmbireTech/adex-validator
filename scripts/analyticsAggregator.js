#!/usr/bin/env node
/* eslint-disable no-underscore-dangle */

// const BN = require('bn.js')
const db = require('../db')
const { collections } = require('../services/constants')

// Hourly aggregates
const TIME_INTERVAL = 60 * 60 * 1000

// eslint-disable-next-line no-console
const { log } = console

/*
function sumBNValues(obj = {}) {
	return Object.values(obj)
		.map(x => new BN(x, 10))
		.reduce((a, b) => a.add(b), new BN(0))
}
*/

function floorToInterval(date) {
	return new Date(date.getTime() - (date.getTime() % TIME_INTERVAL))
}

async function aggregate() {
	await db.connect()
	const analyticsCol = db.getMongo().collection(collections.analyticsAggregate)
	const eventsCol = db.getMongo().collection(collections.eventAggregates)

	const lastAggr = await analyticsCol.findOne({}, { sort: { created: -1 } })
	// created will be set to `end`, so the correct start is the last aggr's .created (end)
	const start = (lastAggr
		? lastAggr.end
		: floorToInterval((await eventsCol.findOne()).created)
	).getTime()
	const end = floorToInterval(new Date()).getTime()
	// This for loop is not inclusive of `end` but that's intentional, since we don't want to produce an aggregate for an ongoing hour
	for (let i = start; i !== end; i += TIME_INTERVAL) {
		log(new Date(i), new Date(i + TIME_INTERVAL))
	}
	log(new Date())
}

/*
async function aggregateForPeriod(start, end) {
	// produces a separate aggregate per channel

	const pipeline = [
		{ $match: { created: {
			$gte: start,
			$lt: end
		} } },
		{
			$group: {
				_id: {
					channelId: '$channelId'
				},
				aggr: { $push: '$events' },
			}
		}
	]

	const data = await eventsCol.aggregate(pipeline).toArray()

	await Promise.all(
		data.map(async ({ aggr, _id }) => {
			const analyticDoc = {
				channelId: _id.channelId,
				created: end,
				events: {},
				earners: [],
				totals: {}
			}

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

			return analyticsCol.insert(analyticDoc)
		})
	)
}
*/

aggregate().then(() => {
	log(`Finished processing ${new Date()}`)
	process.exit()
})
