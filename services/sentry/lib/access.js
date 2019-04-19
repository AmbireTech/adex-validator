const { promisify } = require('util')

const db = require('../../../db')
const cfg = require('../../../cfg')

const redisCli = db.getRedis()
const redisExists = promisify(redisCli.exists).bind(redisCli)
const redisSetex = promisify(redisCli.setex).bind(redisCli)

async function checkAccess(channel, session, events) {
	// Check basic access rules
	// only the creator can send a CLOSE
	if (session.uid !== channel.creator && events.find(e => e.type === 'CLOSE')) {
		return { success: false, statusCode: 403 }
	}
	const currentTime = Date.now()
	if (currentTime > channel.validUntil * 1000) {
		return { success: false, statusCode: 400, message: 'channel is expired' }
	}
	if (
		channel.spec.withdrawPeriodStart &&
		currentTime > channel.spec.withdrawPeriodStart &&
		!events.every(e => e.type === 'CLOSE')
	) {
		return { success: false, statusCode: 400, message: 'channel is past withdraw period' }
	}

	// Enforce access limits
	const eventSubmission = channel.spec.eventSubmission
	// The default rules are to allow the creator to submit whatever they like, but rate limit anyone else
	const allowRules =
		eventSubmission && Array.isArray(eventSubmission.allow)
			? eventSubmission.allow
			: [{ uids: [channel.creator] }, { uids: null, rateLimit: cfg.EVENTS_RATE_LIMIT }]
	// first, find an applicable access rule
	const rule = allowRules.find(r => {
		// uid === null means it applies to all UIDs
		if (r.uids === null) return true
		if (Array.isArray(r.uids)) {
			const ourUid = session.uid || null
			return r.uids.includes(ourUid)
		}
		return false
	})
	if (rule && rule.rateLimit && rule.rateLimit.type === 'ip') {
		if (events.length !== 1)
			return { success: false, statusCode: 429, message: 'rateLimit: only allows 1 event' }
		const key = `adexRateLimit:${channel.id}:${session.ip}`
		if (await redisExists(key))
			return { success: false, statusCode: 429, message: 'rateLimit: too many requests' }
		const seconds = Math.ceil(rule.rateLimit.timeframe / 1000)
		await redisSetex(key, seconds, '1')
	}

	return { success: true }
}

module.exports = checkAccess
