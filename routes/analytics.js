const express = require('express')
// const url = require('url')
const { promisify } = require('util')
const { channelLoad } = require('../middlewares/channel')
const { authRequired } = require('../middlewares/auth')
const db = require('../db')

const router = express.Router()
const redisCli = db.getRedis()
const redisGet = promisify(redisCli.get).bind(redisCli)

router.get('/', redisCached(60, analytics))
router.get('/:id', authRequired, channelLoad, redisCached(120, analytics))

const DAY = 24 * 60 * 60 * 1000
function getTimeframe(timeframe) {
	if (timeframe === 'year') {
		// every month in one year
		return { period: 365 * DAY, interval: 30 * DAY }
	}

	if (timeframe === 'month') {
		// every day in one month
		return { period: 30 * DAY, interval: DAY }
	}

	if (timeframe === 'day') {
		// every hour in one day
		return { period: DAY, interval: DAY / 24 }
	}
	return {}
}

function analytics(req) {
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
	const { period, interval } = getTimeframe(timeframe) || {}
	if (uid) {
		match[`events.${eventType}.${metric}.${uid}`] = { $exists: true, $ne: null }
	}
	if (req.channel) {
		match = { ...match, channelId: req.channel.id }
	}
	if (period) {
		match = { ...match, created: { $gt: new Date(Date.now() - period) } }
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
					$toDate: {
						$subtract: [{ $toLong: '$created' }, { $mod: [{ $toLong: '$created' }, interval] }]
					}
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
		.then(aggr => ({ aggr }))
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
