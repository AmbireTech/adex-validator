const express = require('express')
const { celebrate } = require('celebrate')
const { promisify } = require('util')
const schema = require('./schemas')
const { channelIfExists } = require('../middlewares/channel')
const { authRequired } = require('../middlewares/auth')
const db = require('../db')

const router = express.Router()
const redisCli = db.getRedis()
const redisGet = promisify(redisCli.get).bind(redisCli)

router.get(
	'/',
	celebrate({ body: schema.eventTimeAggr }),
	redisCached(300, analytics.bind(null, true))
)
// :id is channelId: needs to be named that way cause of channelIfExists
router.get(
	'/:id',
	celebrate({ body: schema.eventTimeAggr }),
	authRequired,
	channelIfExists,
	redisCached(120, analytics.bind(null, false))
)

const DAY = 24 * 60 * 60 * 1000

function getTimeframe(authenticated, timeframe) {
	let result = {}
	// every month in one year
	if (timeframe === 'year') result = { period: 365 * DAY, interval: 30 * DAY }
	// every day in one month
	if (timeframe === 'month') result = { period: 30 * DAY, interval: DAY }
	// every hour in one day
	if (timeframe === 'day') result = { period: DAY, interval: DAY / 24 }
	// if unauthenticated there is a period restriction on the data
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
	if (req.params.id) {
		match = { ...match, channelId: req.params.id }
	}
	if (period) {
		const after = +req.query.after || 0
		match = { ...match, created: { $gt: new Date(new Date(after).getTime() - period) } }
	}

	const pipeline = [
		{ $match: match },
		{
			$project: {
				created: 1,
				value: {
					$sum: {
						$map: {
							input: { $objectToArray: `$events.${eventType}.${metric}` },
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
		{ $sort: { _id: 1, channelId: 1, created: 1 } },
		{ $limit: appliedLimit },
		{ $project: { value: '$value', time: '$_id', _id: 0 } }
	]

	return eventsCol
		.aggregate(pipeline)
		.toArray()
		.then(aggr => ({
			limit: appliedLimit,
			aggr: aggr.map(x => ({
				...x,
				value: x.value.toLocaleString('fullwide', { useGrouping: false })
			}))
		}))
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
