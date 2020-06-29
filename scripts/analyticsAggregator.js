#!/usr/bin/env node
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-await-in-loop */

const BN = require('bn.js')
const db = require('../db')
const { toBNStringMap } = require('../services/validatorWorker/lib')
const { collections } = require('../services/constants')

// Hourly aggregates
const TIME_INTERVAL = 60 * 60 * 1000

// eslint-disable-next-line no-console
const { log } = console

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
		await aggregateForPeriod(new Date(i), new Date(i + TIME_INTERVAL))
	}
}

// produces a separate aggregate per channel
async function aggregateForPeriod(start, end) {
	log(`Producing an aggregate starting at ${start}`)

	const analyticsCol = db.getMongo().collection(collections.analyticsAggregate)
	const eventsCol = db.getMongo().collection(collections.eventAggregates)

	const pipeline = [
		{
			$match: {
				created: {
					$gte: start,
					$lt: end
				}
			}
		},
		{
			$group: {
				_id: '$channelId',
				aggr: { $push: '$events' }
			}
		}
	]

	const data = await eventsCol.aggregate(pipeline).toArray()

	await Promise.all(
		data.map(async ({ aggr, _id }) => {
			const events = {}
			const earners = []
			const totals = {}

			aggr.forEach(evAggr => {
				Object.keys(evAggr).forEach(evType => {
					const { eventCounts, eventPayouts } = evAggr[evType]

					if (!events[evType]) events[evType] = { eventCounts: {}, eventPayouts: {} }
					if (!totals[evType]) totals[evType] = { eventCounts: new BN(0), eventPayouts: new BN(0) }
					Object.keys(eventCounts).forEach(publisher => {
						// if it exists in eventCounts then it may exists in payouts, but not vice versa
						const count = new BN(eventCounts[publisher])
						events[evType].eventCounts[publisher] = (
							events[evType].eventCounts[publisher] || new BN(0)
						).add(count)
						totals[evType].eventCounts = totals[evType].eventCounts.add(count)
						if (eventPayouts[publisher]) {
							const payout = new BN(eventPayouts[publisher])
							events[evType].eventPayouts[publisher] = (
								events[evType].eventPayouts[publisher] || new BN(0)
							).add(payout)
							totals[evType].eventPayouts = totals[evType].eventPayouts.add(payout)
							if (!earners.includes(publisher)) earners.push(publisher)
						}
					})
				})
			})

			const analyticsDoc = {
				channelId: _id,
				created: end,
				events: Object.fromEntries(
					Object.entries(events).map(([evType, { eventCounts, eventPayouts }]) => [
						evType,
						{
							eventCounts: toBNStringMap(eventCounts),
							eventPayouts: toBNStringMap(eventPayouts)
						}
					])
				),
				earners,
				totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, toBNStringMap(v)]))
			}
			// console.log(JSON.stringify(analyticsDoc, null, 4))
			return analyticsCol.insert(analyticsDoc)
		})
	)
}

aggregate().then(() => {
	log(`Finished processing ${new Date()}`)
	process.exit()
})
