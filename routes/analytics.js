const express = require('express')
const { promisify } = require('util')
const { celebrate, Joi } = require('celebrate')
const toBalancesKey = require('../services/sentry/toBalancesKey')
const { getAdvancedReports } = require('../services/sentry/analyticsRecorder')
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
const validate = celebrate({ query: { ...schemas.eventTimeAggr, segmentByChannel: Joi.string() } })

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
router.get('/for-advertiser', validate, authRequired, notCached(advertiserAnalytics))

// Advanced statistics
router.get('/advanced', validate, authRequired, notCached(advancedAnalytics))

router.get(
	'/for-publisher/:id',
	validate,
	authRequired,
	channelIfExists,
	notCached(publisherAnalytics)
)
router.get('/for-admin', validate, authRequired, isAdmin, notCached(adminAnalytics))
// :id is channelId: needs to be named that way cause of channelIfExists
router.get('/:id', validate, channelAdvertiserIfOwns, notCached(advertiserChannelAnalytics))

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const YEAR = 365 * DAY
const ROUGH_MONTH = Math.floor(YEAR / 12)

// In order to use analytics aggregates, we need the span to be at least an hour
const ANALYTICS_MIN_SPAN = HOUR

function getTimeframe(timeframe) {
	// every month in one year
	if (timeframe === 'year') return { period: YEAR, span: ROUGH_MONTH }
	// every day in one month
	if (timeframe === 'month') return { period: ROUGH_MONTH, span: DAY }
	// every 6 hours in a week
	if (timeframe === 'week') return { period: 7 * DAY, span: 6 * HOUR }
	// every hour in one day
	if (timeframe === 'day') return { period: DAY, span: HOUR }
	// every minute in an hour
	if (timeframe === 'hour') return { period: HOUR, span: MINUTE }

	// default is day
	return { period: DAY, span: HOUR }
}

function getTimeGroup(timeframe, prefix = '') {
	if (timeframe === 'month') {
		return { year: `$${prefix}year`, month: `$${prefix}month`, day: `$${prefix}day` }
	}

	if (timeframe === 'week') {
		return {
			year: `$${prefix}year`,
			month: `$${prefix}month`,
			day: `$${prefix}day`,
			hour: { $multiply: [{ $floor: { $divide: [`$${prefix}hour`, 6] } }, 6] }
		}
	}

	if (timeframe === 'day') {
		return {
			year: `$${prefix}year`,
			month: `$${prefix}month`,
			day: `$${prefix}day`,
			hour: `$${prefix}hour`
		}
	}

	if (timeframe === 'hour') {
		return {
			year: `$${prefix}year`,
			month: `$${prefix}month`,
			day: `$${prefix}day`,
			hour: `$${prefix}hour`,
			minute: `$${prefix}minute`
		}
	}

	if (timeframe === 'year') {
		return { year: `$${prefix}year`, month: `$${prefix}month` }
	}

	return { year: '$year' }
}

function getProjAndMatch(channelMatch, start, end, eventType, metric, earner) {
	const timeMatch = end ? { created: { $lte: end, $gte: start } } : { created: { $gte: start } }
	let publisherId = null
	if (earner) {
		publisherId = toBalancesKey(earner)
	}
	const filteredMatch = publisherId ? { earners: publisherId, ...timeMatch } : timeMatch
	const match = channelMatch ? { channelId: channelMatch, ...filteredMatch } : filteredMatch
	const projectValue = publisherId
		? { $toDecimal: `$events.${eventType}.${metric}.${publisherId}` }
		: { $toDecimal: `$totals.${eventType}.${metric}` }
	const project = {
		created: 1,
		channelId: 1,
		value: projectValue,
		year: { $year: '$created' },
		month: { $month: '$created' },
		day: { $dayOfMonth: '$created' },
		hour: { $hour: '$created' },
		minute: { $minute: '$created' }
	}
	return { match, project }
}

function analytics(req, advertiserChannels, earner) {
	// default is applied via validation schema
	const { limit, timeframe, eventType, metric, start, end, segmentByChannel } = req.query

	const { period, span } = getTimeframe(timeframe)

	const collection =
		process.env.ANALYTICS_DB && span >= ANALYTICS_MIN_SPAN
			? db.getMongo().collection(collections.analyticsAggregate)
			: db.getMongo().collection(collections.eventAggregates)

	const channelMatch = advertiserChannels ? { $in: advertiserChannels } : req.params.id
	const { project, match } = getProjAndMatch(
		channelMatch,
		start && !Number.isNaN(new Date(start)) ? new Date(start) : new Date(Date.now() - period),
		end && !Number.isNaN(new Date(end)) ? new Date(end) : null,
		eventType,
		metric,
		earner
	)
	const maxLimit = segmentByChannel
		? cfg.ANALYTICS_FIND_LIMIT_BY_CHANNEL_SEGMENT
		: cfg.ANALYTICS_FIND_LIMIT
	const appliedLimit = Math.min(maxLimit, limit)

	const timeGroup = getTimeGroup(timeframe)

	const group = {
		_id: segmentByChannel ? { time: timeGroup, channelId: '$channelId' } : { time: timeGroup },
		value: { $sum: '$value' }
	}

	const resultProjection = {
		// NOTE: the toString will work fine w/o scientific notation for numbers up to 34 digits long
		value: { $toString: '$value' },
		time: {
			$toLong: {
				$dateFromParts: {
					year: { $ifNull: ['$_id.time.year', 0] },
					month: { $ifNull: ['$_id.time.month', 1] },
					day: { $ifNull: ['$_id.time.day', 1] },
					hour: { $ifNull: ['$_id.time.hour', 0] },
					minute: { $ifNull: ['$_id.time.minute', 0] },
					timezone: 'UTC'
				}
			}
		},
		channelId: '$_id.channelId',
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
		.aggregate(pipeline, { maxTimeMS: 15000 })
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

async function advertiserAnalytics(req) {
	return analytics(req, await getAdvertiserChannels(req), null)
}

async function advertiserChannelAnalytics(req) {
	return analytics(req, [req.params.id], null)
}

async function advancedAnalytics(req) {
	const evType = req.query.eventType
	const publisher = toBalancesKey(req.session.uid)
	const channels = await getAdvertiserChannels(req)
	return getAdvancedReports({ evType, publisher, channels })
}

async function adminAnalytics(req) {
	const { channels, earner } = req.query
	if (!channels) throw new Error('please provide channels query param')
	return analytics(req, channels.split('+'), earner)
}

function getAdvertiserChannels(req) {
	const channelsCol = db.getMongo().collection('channels')
	const uid = req.session.uid
	const advChannels = channelsCol
		.find({ creator: uid }, { projection: { _id: 1 } })
		.toArray()
		// eslint-disable-next-line no-underscore-dangle
		.then(res => res.map(x => x._id))

	return advChannels
}

function channelAdvertiserIfOwns(req, res, next) {
	const channelsCol = db.getMongo().collection('channels')
	if (!req.session) {
		res.status(403).json(null)
		return
	}
	const uid = req.session.uid
	channelsCol
		.countDocuments({ _id: req.params.id, creator: uid }, { limit: 1 })
		.then(function(n) {
			if (!n) {
				res.status(403).json(null)
			} else {
				next()
			}
		})
		.catch(next)
}

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
