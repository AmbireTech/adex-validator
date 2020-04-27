#!/usr/bin/env node
/* eslint-disable no-underscore-dangle */

const BN = require('bn.js')
const db = require('../db')
const { sumBNValues } = require('../services')
const { collections } = require('../services/constants')

// Default TIME_INTERVAL 5 mins
const TIME_INTERVAL = parseInt(process.env.TIME_INTERVAL, 10) * 60 * 1000 || 5 * 60 * 1000

// eslint-disable-next-line no-console
const { log } = console

async function aggregate() {
	await db.connect()
	// enter the eventAggregates collection
	// produce a new aggregate per channel
	const analyticsCol = db.getMongo().collection(collections.analyticsAggregate)
	const eventsCol = db.getMongo().collection(collections.eventAggregates)

	const lastAggr = await analyticsCol.findOne({}, { sort: ['created', 'desc'] })
	const start = (lastAggr && lastAggr.created) || new Date(0)

	const pipeline = [
		{ $match: { created: { $gte: start } } },
		{ $limit: 10000 },
		{
			$group: {
				_id: {
					time: {
						$subtract: [{ $toLong: '$created' }, { $mod: [{ $toLong: '$created' }, TIME_INTERVAL] }]
					},
					channelId: '$channelId'
				},
				aggr: { $push: '$events' },
				earners: { $push: '$earners' }
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
		data.map(async ({ aggr, _id, earners }) => {
			const events = {}
			const totals = {}
			aggr.forEach(evAggr => {
				Object.keys(evAggr).forEach(evType => {
					const { eventCounts, eventPayouts } = evAggr[evType]

					totals[evType] = {
						eventCounts: new BN((totals[evType] && totals[evType].eventCounts) || '0')
							.add(sumBNValues(eventCounts))
							.toString(),
						eventPayouts: new BN((totals[evType] && totals[evType].eventPayouts) || '0')
							.add(sumBNValues(eventPayouts))
							.toString()
					}

					Object.keys(eventCounts).forEach(publisher => {
						// if it exists in eventCounts then it exists in payouts
						if (events[evType] && events[evType].eventCounts[publisher]) {
							events[evType].eventCounts[publisher] = new BN(eventCounts[publisher])
								.add(new BN(events[evType].eventCounts[publisher]))
								.toString()
							events[evType].eventPayouts[publisher] = new BN(eventPayouts[publisher])
								.add(new BN(events[evType].eventPayouts[publisher]))
								.toString()
						} else {
							events[evType] = {
								eventCounts: {
									...(events[evType] && events[evType].eventCounts),
									[publisher]: eventCounts[publisher]
								},
								eventPayouts: {
									...(events[evType] && events[evType].eventPayouts),
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
					$set: {
						_id: `${_id.channelId}:${_id.time}`,
						channelId: _id.channelId,
						created: new Date(_id.time),
						earners,
						events,
						totals
					}
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
