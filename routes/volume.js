const express = require('express')
const url = require('url')
const { promisify } = require('util')
const db = require('../db')

const redisCli = db.getRedis()
const redisGet = promisify(redisCli.get).bind(redisCli)

const router = express.Router()

function volumeRoute(monthlyImpressions) {
	const eventsCol = db.getMongo().collection('eventAggregates')
	const DAY = 24 * 60 * 60 * 1000
	const period = monthlyImpressions ? 30 * DAY : DAY
	const interval = monthlyImpressions ? DAY : 15 * 60 * 1000
	const metric = monthlyImpressions ? 'eventCounts' : 'eventPayouts'
	const pipeline = [
		{ $match: { created: { $gt: new Date(Date.now() - period) } } },
		{
			$project: {
				created: 1,
				value: {
					$sum: {
						$map: {
							input: { $objectToArray: `$events.IMPRESSION.${metric}` },
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
		{ $project: { value: { $toString: '$value' }, time: '$_id', _id: 0 } }
	]

	return eventsCol
		.aggregate(pipeline)
		.toArray()
		.then(aggr => ({ aggr }))
}

// takes seconds: Number, fn: fn(req: object) -> object
function redisCached(seconds, fn) {
	return function(req, res, next) {
		const pathname = url.parse(req.originalUrl).pathname
		const key = `CACHE:${pathname}`

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

router.get('/', redisCached(60, volumeRoute.bind(null, false)))
router.get('/monthly-impressions', redisCached(120, volumeRoute.bind(null, true)))

module.exports = router
