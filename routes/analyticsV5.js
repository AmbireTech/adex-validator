const express = require('express')
const { promisify } = require('util')
const { celebrate, Joi } = require('celebrate')
const toBalancesKey = require('../services/sentry/toBalancesKey')
const schemas = require('./schemas')
const { channelIfExists } = require('../middlewares/channel')
const db = require('../db')
const { collections } = require('../services/constants')
const cfg = require('../cfg')

const router = express.Router()
const redisCli = db.getRedis()
const redisGet = promisify(redisCli.get).bind(redisCli)
const authRequired = (req, res, next) => (req.session ? next() : res.sendStatus(401))
const notCached = fn => (req, res, next) =>
	fn(req)
		.then(res.json.bind(res))
		.catch(next)

// @TODO: timeframe should not support hour, we do not have this granularity
const validate = celebrate({
	query: {
		...schemas.eventTimeAggr,
		segmentByChannel: Joi.string(),
		timezone: Joi.string()
	}
})

const isAdmin = (req, res, next) => {
	if (cfg.admins.includes(req.session.uid)) {
		return next()
	}
	return res.sendStatus(401)
}

// Global statistics
// WARNING: redisCached can only be used on methods that are called w/o auth
router.get('/', validate, redisCached(500, analytics))
router.get('/for-publisher', validate, authRequired, notCached(publisherAnalytics))
// router.get('/for-advertiser', validate, authRequired, notCached(advertiserAnalytics))

router.get(
	'/for-publisher/:id',
	validate,
	authRequired,
	channelIfExists,
	notCached(publisherAnalytics)
)
router.get('/for-admin', validate, authRequired, isAdmin, notCached(adminAnalytics))
// :id is channelId: needs to be named that way cause of channelIfExists
// @TODO
// router.get('/:id', validate, channelAdvertiserIfOwns, notCached(advertiserChannelAnalytics))

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

function getProjAndMatch(channelMatch, start, end, eventType, metric, earner, timezone) {
	const timeMatch = end
		? { 'keys.time': { $lte: end, $gte: start } }
		: { 'keys.time': { $gte: start } }
	let publisherId = null
	if (earner) {
		publisherId = toBalancesKey(earner)
	}
	const filteredMatch = publisherId ? { 'keys.publisher': publisherId, ...timeMatch } : timeMatch
	const match = channelMatch ? { channelId: channelMatch, ...filteredMatch } : filteredMatch
	const project = {
		'keys.time': 1,
		'keys.campaignId': 1,
		// @TODO metric can be count, paid
		value: `$values.${eventType}.${metric}`,
		year: { $year: { date: '$keys.time', timezone } },
		month: { $month: { date: '$keys.time', timezone } },
		day: { $dayOfMonth: { date: '$keys.time', timezone } },
		hour: { $hour: { date: '$keys.time', timezone } }
	}
	return { match, project }
}

function analytics(req, advertiserChannels, earner) {
	// default is applied via validation schema
	// @TODO
	const {
		limit,
		timeframe,
		eventType,
		metric,
		start,
		end,
		segmentByChannel,
		timezone = 'UTC'
	} = req.query

	const period = getMaxPeriod(timeframe)

	const collection = db.getMongo().collection(collections.analyticsV5)

	const channelMatch = advertiserChannels ? { $in: advertiserChannels } : req.params.id
	const { project, match } = getProjAndMatch(
		channelMatch,
		start && !Number.isNaN(new Date(start)) ? new Date(start) : new Date(Date.now() - period),
		end && !Number.isNaN(new Date(end)) ? new Date(end) : null,
		eventType,
		metric,
		earner,
		timezone
	)
	const maxLimit = cfg.ANALYTICS_FIND_LIMIT_V5
	const appliedLimit = Math.min(maxLimit, limit)

	const timeGroup = getTimeGroup(timeframe)

	const group = {
		// @TODO segment
		_id: segmentByChannel
			? { time: timeGroup, campaignId: '$keys.campaignId' }
			: { time: timeGroup },
		value: { $sum: '$value' }
	}

	const resultProjection = {
		// NOTE: the toString will work fine w/o scientific notation for numbers up to 34 digits long
		// @TODO get rid of this
		value: { $toString: '$value' },
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
		.then(aggr => ({
			limit: appliedLimit,
			aggr
		}))
}

async function publisherAnalytics(req) {
	const earner = req.session.uid
	return analytics(req, null, earner)
}

// @TODO
// async function advertiserAnalytics(req) {
// 	return analytics(req, await getAdvertiserChannels(req), null)
// }

// async function advertiserChannelAnalytics(req) {
//	return analytics(req, [req.params.id], null)
// }

async function adminAnalytics(req) {
	const { channels, earner } = req.query
	if (!channels) throw new Error('please provide channels query param')
	return analytics(req, channels.split('+'), earner)
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
			.catch(next)
	}
}

module.exports = router
