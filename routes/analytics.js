const express = require('express')
const { promisify } = require('util')
const { celebrate } = require('celebrate')
const toBalancesKey = require('../services/sentry/toBalancesKey')
const { getAdvancedReports } = require('../services/sentry/analyticsRecorder')
const schemas = require('./schemas')
const { channelIfExists } = require('../middlewares/channel')
const db = require('../db')

const router = express.Router()
const redisCli = db.getRedis()
const redisGet = promisify(redisCli.get).bind(redisCli)
const authRequired = (req, res, next) => (req.session ? next() : res.sendStatus(401))
const notCached = fn => (req, res, next) =>
	fn(req)
		.then(res.json.bind(res))
		.catch(next)
const validate = celebrate({ query: schemas.eventTimeAggr })

// Global statistics
router.get('/', validate, redisCached(400, analytics))
router.get('/for-publisher', validate, authRequired, notCached(analytics))
router.get('/for-advertiser', validate, authRequired, notCached(advertiserAnalytics))

// Advanced statistics
router.get('/advanced', validate, authRequired, notCached(advancedAnalytics))

// :id is channelId: needs to be named that way cause of channelIfExists
router.get('/:id', validate, channelIfExists, redisCached(600, analytics))
router.get('/for-publisher/:id', validate, authRequired, channelIfExists, notCached(analytics))

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const YEAR = 365 * DAY
const ROUGH_MONTH = Math.floor(YEAR / 12)
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

function getProjAndMatch(
	session,
	channelMatch,
	start,
	end,
	eventType,
	metric,
	skipPublisherFiltering
) {
	const timeMatch = end ? { created: { $lte: end, $gt: start } } : { created: { $gt: start } }
	const publisherId = !skipPublisherFiltering && session ? toBalancesKey(session.uid) : null
	const filteredMatch = publisherId ? { earners: publisherId, ...timeMatch } : timeMatch
	const match = channelMatch ? { channelId: channelMatch, ...filteredMatch } : filteredMatch
	const projectValue = publisherId
		? { $toLong: `$events.${eventType}.${metric}.${publisherId}` }
		: { $toLong: `$totals.${eventType}.${metric}` }
	const project = {
		created: 1,
		value: projectValue
	}
	return { match, project }
}

function analytics(req, advertiserChannels, skipPublisherFiltering) {
	const eventsCol = db.getMongo().collection('eventAggregates')
	const { limit, timeframe, eventType, metric, start, end } = req.query
	const { period, span } = getTimeframe(timeframe)
	const channelMatch = advertiserChannels ? { $in: advertiserChannels } : req.params.id
	const { project, match } = getProjAndMatch(
		req.session,
		channelMatch,
		start && !Number.isNaN(new Date(start)) ? new Date(start) : new Date(Date.now() - period),
		end && !Number.isNaN(new Date(end)) ? new Date(end) : null,
		eventType,
		metric,
		skipPublisherFiltering
	)
	const appliedLimit = Math.min(200, limit)

	const group = {
		_id: {
			$subtract: [{ $toLong: '$created' }, { $mod: [{ $toLong: '$created' }, span] }]
		},
		value: { $sum: '$value' }
	}

	if (req.query.segmentByChannel && !skipPublisherFiltering) {
		// adds channelId to group
		group.channelId = '$channelId'
	}

	const pipeline = [
		{ $match: match },
		{ $project: project },
		{
			$group: { ...group }
		},
		{ $sort: { _id: 1, channelId: 1, created: 1 } },
		{ $limit: appliedLimit },
		{ $project: { value: '$value', time: '$_id', _id: 0 } }
	]

	return eventsCol
		.aggregate(pipeline, { maxTimeMS: 10000 })
		.toArray()
		.then(aggr => ({
			limit: appliedLimit,
			aggr: aggr.map(x => ({
				...x,
				value: x.value.toLocaleString('fullwide', { useGrouping: false })
			}))
		}))
}

async function advertiserAnalytics(req) {
	return analytics(req, await getAdvertiserChannels(req), true)
}

async function advancedAnalytics(req) {
	const evType = req.query.eventType
	const publisher = toBalancesKey(req.session.uid)
	const channels = await getAdvertiserChannels(req)
	return getAdvancedReports({ evType, publisher, channels })
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
