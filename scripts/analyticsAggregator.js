#!/usr/bin/env node
/* eslint-disable no-underscore-dangle */

const BN = require('bn.js')
const db = require('../db')
const { sumBNValues } = require('../services')
const { collections } = require('../services/constants')

// Default TIME_INTERVAL 5 mins
const TIME_INTERVAL = parseInt(process.env.TIME_INTERVAL, 10) * 60 * 1000 || 5 * 60 * 1000
const LIMIT = parseInt(process.env.LIMIT, 10) || 10000

// eslint-disable-next-line no-console
const { log } = console

async function aggregate() {
	await db.connect()
	// enter the eventAggregates collection
	// produce a new aggregate per channel
	const analyticsCol = db.getMongo().collection(collections.analyticsAggregate)
	const eventsCol = db.getMongo().collection(collections.eventAggregates)

	const lastAggr = await analyticsCol.findOne({}, { sort: ['created', 'desc'] })
	const start = (lastAggr && lastAggr.lastUpdateTimestamp) || new Date(0)

	const pipeline = [
		{ $match: { created: { $gt: start } } },
		{ $limit: LIMIT },
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

	await Promise.all(
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

			return analyticsCol.updateOne(
				{
					_id: `${_id.channelId}:${_id.time}`
				},
				{
					$set: analyticDoc
				},
				{
					upsert: true
				}
			)
		})
	)
}

aggregate().then(() => {
	log(`Finished processing ${new Date()}`)
	process.exit()
})
