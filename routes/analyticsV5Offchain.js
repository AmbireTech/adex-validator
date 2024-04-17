const express = require('express')
const { promisify } = require('util')
const { celebrate, Joi } = require('celebrate')
const db = require('../db')
const { collections } = require('../services/constants')
const cfg = require('../cfg')

const router = express.Router()
const redisCli = db.getRedis()
const redisGet = promisify(redisCli.get).bind(redisCli)
const authRequired = (req, res, next) => (req.session ? next() : res.sendStatus(401))
const RouteErr = (code, msg) => {
	const err = new Error(msg)
	err.code = code
	return err
}
const handleErr = (res, err) => {
	if (err && err.code && err.message)
		res.status(err.code).json({ message: err.message, code: err.code })
	else throw err
}
const notCached = fn => (req, res, next) =>
	fn(req)
		.then(res.json.bind(res))
		.catch(handleErr.bind(null, res))
		.catch(next)

const allowedKeys = [
	'campaignId',
	'adUnit',
	'adSlot',
	'adSlotType',
	'advertiser',
	'publisher',
	'ssp',
	'sspPublisher',
	'hostname',
	'placement',
	'country',
	'osName'
]
const validate = celebrate(
	{
		query: {
			eventType: Joi.string()
				.valid(['IMPRESSION', 'CLICK'])
				.default('IMPRESSION'),
			metric: Joi.string()
				.valid(['count', 'paid'])
				.default('count'),
			timeframe: Joi.string()
				.valid(['year', 'month', 'week', 'day', 'hour'])
				.default('day'),
			start: Joi.date(),
			end: Joi.date(),
			limit: Joi.number().default(100),
			segmentBy: Joi.string(),
			// @TODO: check what happens if an invalid value is supplied
			timezone: Joi.string().default('UTC')
		}
	},
	{ allowUnknown: true }
)

const isAdmin = (req, res, next) => {
	if (cfg.admins.includes(req.session.uid)) {
		return next()
	}
	return res.sendStatus(401)
}

// Global statistics
// WARNING: redisCached can only be used on methods that are called w/o auth
router.get(
	'/',
	validate,
	redisCached(500, req => analytics(req, { allowedKeys: ['country', 'adSlotType'] }))
)
router.get(
	'/for-publisher',
	validate,
	authRequired,
	notCached(req => analytics(req, { authAsKey: 'publisher' }))
)
router.get(
	'/for-advertiser',
	validate,
	authRequired,
	notCached(req => analytics(req, { authAsKey: 'advertiser' }))
)
// just plain analytics() w/o options is unrestricted: it can query/segment by all keys, and it doesn't restrict the dataset to a publisher/advertiser
router.get('/for-admin', validate, authRequired, isAdmin, notCached(analytics))

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const YEAR = 365 * DAY

function getMaxPeriod(timeframe) {
	if (timeframe === 'year') return YEAR
	if (timeframe === 'month') return YEAR / 12
	if (timeframe === 'week') return 7 * DAY
	if (timeframe === 'day') return DAY
	return DAY
}

// NOTE: optimized was looking like that `($subtract: [{ $toLong: '$created' }, { $mod: [{ $toLong: '$created' }, span] }])`
// Year timeframe groups (month start) was not correct - leap years + there was no timezones
// Its slower now - more info at https://github.com/AdExNetwork/adex-validator/pull/312
// and https://gist.github.com/IvoPaunov/1b23223b558ae4b8b6d2ba4ac408919f
function getTimeGroup(timeframe) {
	if (timeframe === 'year') {
		return { year: `$year`, month: `$month` }
	}
	if (timeframe === 'month') {
		return { year: `$year`, month: `$month`, day: `$day` }
	}

	if (timeframe === 'week') {
		return {
			year: `$year`,
			month: `$month`,
			day: `$day`,
			hour: `$hour`
			// NOTE: if we want custom hour span
			// hour: { $multiply: [{ $floor: { $divide: [`$hour`, weekHoursSpan] } }, weekHoursSpan] }
		}
	}

	if (timeframe === 'day') {
		return {
			year: `$year`,
			month: `$month`,
			day: `$day`,
			hour: `$hour`
		}
	}
	throw new Error('unsupported time group')
}

function getTimeProjAndMatch(start, end, eventType, metric, timezone) {
	const match = end ? { 'keys.time': { $lte: end, $gte: start } } : { 'keys.time': { $gte: start } }
	const project = {
		value: `$${eventType}.${metric}`,
		year: { $year: { date: '$keys.time', timezone } },
		month: { $month: { date: '$keys.time', timezone } },
		day: { $dayOfMonth: { date: '$keys.time', timezone } },
		hour: { $hour: { date: '$keys.time', timezone } }
	}
	return { match, project }
}

function analytics(req, opts = {}) {
	const { limit, timeframe, eventType, metric, start, end, segmentBy, timezone } = req.query

	console.log('query', req.query)

	const period = getMaxPeriod(timeframe)
	const collection = db.getMongo().collection(collections.analyticsV5)
	const { project, match } = getTimeProjAndMatch(
		start && !Number.isNaN(new Date(start)) ? new Date(start) : new Date(Date.now() - period),
		end && !Number.isNaN(new Date(end)) ? new Date(end) : null,
		eventType,
		metric,
		timezone
	)

	// There's four authentication groups: admin, publisher, advertiser, global
	// Apply the query and grouping
	const allowed = opts.allowedKeys || allowedKeys
	if (segmentBy) {
		if (!allowed.includes(segmentBy)) {
			throw RouteErr(403, 'disallowed segmentBy')
		}
		project.segment = `$keys.${segmentBy}`
	}
	allowedKeys.forEach(key => {
		const inQuery = req.query[key]
		if (inQuery) {
			if (!allowed.includes(key)) throw RouteErr(403, 'disallowed query key')
			match[`keys.${key}`] = Array.isArray(inQuery) ? { $in: inQuery } : inQuery
		}
	})
	// IMPORTANT FOR SECURITY: this must be LAST so that req.query.publisher/req.query.advertiser cannot override it
	if (opts.authAsKey) {
		if (!req.session) throw new Error('internal err: auth required')
		match[`keys.${opts.authAsKey}`] = req.session.uid
	}

	// Everything from here on out is generic no matter what the query is
	const timeGroup = getTimeGroup(timeframe)
	const group = {
		_id: segmentBy ? { time: timeGroup, segment: `$segment` } : { time: timeGroup },
		value: { $sum: '$value' }
	}

	const resultProjection = {
		value: '$value',
		time: {
			$toLong: {
				$dateFromParts: {
					year: { $ifNull: ['$_id.time.year', 0] },
					month: { $ifNull: ['$_id.time.month', 1] },
					day: { $ifNull: ['$_id.time.day', 1] },
					hour: { $ifNull: ['$_id.time.hour', 0] },
					timezone: timezone || 'UTC'
				}
			}
		},
		segment: '$_id.segment',
		_id: 0
	}

	console.log({ resultProjection })

	const maxLimit = cfg.ANALYTICS_FIND_LIMIT_V5
	const appliedLimit = Math.min(maxLimit, limit)
	const pipeline = [
		{ $match: match },
		{ $project: project },
		{ $group: group },
		{ $sort: { _id: 1, channelId: 1, created: 1 } },
		{ $match: { value: { $gt: 0 } } },
		{ $limit: appliedLimit },
		{ $project: resultProjection }
	]

	return collection
		.aggregate(pipeline, { maxTimeMS: cfg.ANALYTICS_MAXTIME_V5 })
		.toArray()
		.then(aggr => {
			// console.log(aggr)
			return {
				limit: appliedLimit,
				limitReached: appliedLimit === aggr.length,
				aggr
			}
		})
		.catch(err => {
			console.log(err)
		})
}

// maybe not needed - or at least we need to be extra careful with the cache times (not too long)
function redisCached(seconds, fn) {
	return function(req, res, next) {
		if (req.session) {
			res.status(500).json(null)
			return
		}
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
			.catch(handleErr.bind(null, res))
			.catch(next)
	}
}

module.exports = router
