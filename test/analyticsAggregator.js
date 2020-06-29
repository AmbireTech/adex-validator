#!/usr/bin/env node
/* eslint-disable no-console */

const tape = require('tape-catch')
const { exec } = require('./lib')
const db = require('../db')
const { collections } = require('../services/constants')

const channelId = '0x0b341e6959d61f3d9fbc22f5d9983820c661b51ecc059c15dbf5f19f94823b7e'
const fixtures = [
	{
		_id: '5ea1b18ce3110d3700d2928e',
		channelId,
		created: new Date('2020-04-23T15:17:32.716Z'),
		events: {
			IMPRESSION: {
				eventCounts: {
					'0xb7d3f81e857692d13e9d63b232a90f4a1793189e': '201',
					'0x1bfe15ac2930bd02fea242f4a4b3ead2f37ed1a2': '2'
				},
				eventPayouts: {
					'0xb7d3f81e857692d13e9d63b232a90f4a1793189e': '201',
					'0x1bfe15ac2930bd02fea242f4a4b3ead2f37ed1a2': '2'
				}
			},
			CLICK: {
				eventCounts: { '0x404758cc2673afc59c79fee00bb2d554b1a34fa1': '1' },
				eventPayouts: { '0x404758cc2673afc59c79fee00bb2d554b1a34fa1': '0' }
			}
		},
		totals: {
			IMPRESSION: { eventCounts: '203', eventPayouts: '203' },
			CLICK: { eventCounts: '1', eventPayouts: '0' }
		},
		earners: [
			'0xb7d3f81e857692d13e9d63b232a90f4a1793189e',
			'0x1bfe15ac2930bd02fea242f4a4b3ead2f37ed1a2',
			'0x404758cc2673afc59c79fee00bb2d554b1a34fa1'
		]
	},
	{
		_id: '5ea1b190e3110d3700d292aa',
		channelId,
		created: new Date('2020-04-23T15:17:36.806Z'),
		events: {
			IMPRESSION: {
				eventCounts: { '0xb7d3f81e857692d13e9d63b232a90f4a1793189e': '59' },
				eventPayouts: { '0xb7d3f81e857692d13e9d63b232a90f4a1793189e': '59' }
			}
		},
		totals: { IMPRESSION: { eventCounts: '59', eventPayouts: '59' } },
		earners: ['0xb7d3f81e857692d13e9d63b232a90f4a1793189e']
	},
	{
		_id: '5ea1b191e3110d3700d292ae',
		channelId,
		created: new Date('2020-04-23T15:17:37.401Z'),
		events: {
			IMPRESSION: {
				eventCounts: { '0xb7d3f81e857692d13e9d63b232a90f4a1793189e': '3' },
				eventPayouts: { '0xb7d3f81e857692d13e9d63b232a90f4a1793189e': '3' }
			}
		},
		totals: { IMPRESSION: { eventCounts: '3', eventPayouts: '3' } },
		earners: ['0xb7d3f81e857692d13e9d63b232a90f4a1793189e']
	}
]

const result = {
	_id: '0x0b341e6959d61f3d9fbc22f5d9983820c661b51ecc059c15dbf5f19f94823b7e:1587654900000',
	channelId: '0x0b341e6959d61f3d9fbc22f5d9983820c661b51ecc059c15dbf5f19f94823b7e',
	created: new Date('2020-04-23T16:00:00.000Z'),
	earners: [
		'0x1bfe15ac2930bd02fea242f4a4b3ead2f37ed1a2',
		'0x404758cc2673afc59c79fee00bb2d554b1a34fa1',
		'0xb7d3f81e857692d13e9d63b232a90f4a1793189e'
	],
	events: {
		IMPRESSION: {
			eventCounts: {
				'0xb7d3f81e857692d13e9d63b232a90f4a1793189e': '263',
				'0x1bfe15ac2930bd02fea242f4a4b3ead2f37ed1a2': '2'
			},
			eventPayouts: {
				'0xb7d3f81e857692d13e9d63b232a90f4a1793189e': '263',
				'0x1bfe15ac2930bd02fea242f4a4b3ead2f37ed1a2': '2'
			}
		},
		CLICK: {
			eventCounts: { '0x404758cc2673afc59c79fee00bb2d554b1a34fa1': '1' },
			eventPayouts: { '0x404758cc2673afc59c79fee00bb2d554b1a34fa1': '0' }
		}
	},
	totals: {
		IMPRESSION: { eventCounts: '265', eventPayouts: '265' },
		CLICK: { eventCounts: '1', eventPayouts: '0' }
	}
}

tape('analyticsAggregator: aggregate', async t => {
	await db.connect()
	const { DB_MONGO_NAME } = process.env

	// insert fixtures
	await db
		.getMongo()
		.collection(collections.eventAggregates)
		.insertMany(fixtures)

	await exec(`DB_MONGO_NAME='${DB_MONGO_NAME}' ./scripts/analyticsAggregator.js`)

	const eventCount = await db
		.getMongo()
		.collection(collections.eventAggregates)
		.countDocuments()

	const aggrCount = await db
		.getMongo()
		.collection(collections.analyticsAggregate)
		.countDocuments()

	const eventAggr = await db
		.getMongo()
		.collection(collections.eventAggregates)
		.findOne()

	const analyticAggr = await db
		.getMongo()
		.collection(collections.analyticsAggregate)
		.findOne({ channelId })

	t.deepEqual(result.events, analyticAggr.events, 'should perform correct events aggregation')
	t.deepEqual(result.totals, analyticAggr.totals, 'should perform correct totals aggregation')

	t.deepEquals(
		Object.keys(eventAggr).sort(),
		Object.keys(analyticAggr).sort(),
		'should have the same db structure'
	)
	t.ok(eventCount > aggrCount, 'should perform reduce aggregation')
	t.end()
})

tape.onFinish(() => db.close().then(() => console.log(`close db connection`)))
