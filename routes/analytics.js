const express = require('express')
const { celebrate } = require('celebrate')
// const url = require('url')
const { promisify } = require('util')
const schema = require('./schemas')
const { channelLoad } = require('../middlewares/channel')
const { authRequired } = require('../middlewares/auth')
const db = require('../db')

const router = express.Router()
const redisCli = db.getRedis()
const redisGet = promisify(redisCli.get).bind(redisCli)

router.get(
	'/',
	celebrate({ body: schema.eventTimeAggr }),
	redisCached(60, analytics.bind(null, true))
)
router.get(
	'/:id',
	celebrate({ body: schema.eventTimeAggr }),
	authRequired,
	channelLoad,
	redisCached(120, analytics.bind(null, false))
)

const DAY = 24 * 60 * 60 * 1000

function getTimeframe(authenticated, timeframe) {
	let result = {}

	if (timeframe === 'year') {
		// every month in one year
		result = { period: 365 * DAY, interval: 30 * DAY }
	}

	if (timeframe === 'month') {
		// every day in one month
		result = { period: 30 * DAY, interval: DAY }
	}

	if (timeframe === 'day') {
		// every hour in one day
		result = { period: DAY, interval: DAY / 24 }
	}
	// if unauthenticated there are restrictions on the data points
	// being fetched
	return authenticated ? { ...result, period: 0 } : result
}

function analytics(global, req) {
	const { uid } = req.session || {}
	const {
		eventType = 'IMPRESSION',
		metric = 'eventPayouts',
		timeframe = 'day',
		limit = 100
	} = req.query
	const appliedLimit = Math.min(200, limit)
	const eventsCol = db.getMongo().collection('eventAggregates')

	let match = {}
	const { period, interval } = getTimeframe(!!uid, timeframe) || {}
	if (!global && uid) {
		match[`events.${eventType}.${metric}.${uid}`] = { $exists: true, $ne: null }
	}
	if (req.channel) {
		match = { ...match, channelId: req.channel.id }
	}
	if (period) {
		const after = +req.query.after || 0
		match = { ...match, created: { $gt: new Date(new Date(after).getTime() - period) } }
	}

	const pipeline = [
		{ $match: { ...match } },
		{
			$project: {
				created: 1,
				value: {
					$sum: {
						$map: {
							input: { $objectToArray: `$events.IMPRESSION.eventPayouts` },
							as: 'item',
							in: { $toLong: '$$item.v' }
						}
					}
				}
			}
		},
		{
			$group: {
				_id: {
					$subtract: [{ $toLong: '$created' }, { $mod: [{ $toLong: '$created' }, interval] }]
				},
				value: { $sum: '$value' }
			}
		},
		{ $sort: { _id: 1 } },
		{ $limit: appliedLimit },
		{ $project: { value: { $toString: '$value' }, time: '$_id', _id: 0 } }
	]

	return eventsCol
		.aggregate(pipeline)
		.toArray()
		.then(aggr => ({ limit: appliedLimit, aggr }))
}

function redisCached(seconds, fn) {
	return function(req, res, next) {
		const key = `CACHE:${req.originalUrl}`

		redisGet(key)
			.then(cached => {
				if (cached) {
					res.setHeader('Content-Type', 'application/json')
					res.send(cached)
					return Promise.resolve()
				}
				return fn(req).then(resp => {
					// no need to wait for that
					redisCli.setex(key, seconds, JSON.stringify(resp))
					res.send(resp)
				})
			})
			.catch(next)
	}
}

module.exports = router
