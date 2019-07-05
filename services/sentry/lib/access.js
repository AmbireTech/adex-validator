const { promisify } = require('util')

const db = require('../../../db')
const cfg = require('../../../cfg')

const redisCli = db.getRedis()
const redisExists = promisify(redisCli.exists).bind(redisCli)
const redisSetex = promisify(redisCli.setex).bind(redisCli)

async function checkAccess(channel, session, events) {
	// Check basic access rules
	// only the creator can send a CLOSE
	if (session.uid !== channel.creator && events.find(e => e.type === 'CLOSE' || e.type === 'PAY')) {
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
			: [{ uids: [channel.creator] }, { uids: null, rateLimit: cfg.IP_RATE_LIMIT }]
	// first, find an applicable access rule
	const rules = allowRules.filter(r => {
		// uid === null means it applies to all UIDs
		if (r.uids === null) return true
		if (Array.isArray(r.uids)) {
			const ourUid = session.uid || null
			return r.uids.includes(ourUid)
		}
		return false
	})

	const noLimitRule = rules.find(r => !r.rateLimit)
	if (noLimitRule) {
		// We matched a rule that has no rateLimit, so we're good
		return { success: true }
	}

	const ifErr = await Promise.all(
		rules.map(async rule => {
			// Matching rule has no rateLimit, so we're good
			if (!rule.rateLimit) return null

			const type = rule.rateLimit.type
			let key
			if (type === 'sid') {
				if (!session.uid) {
					return new Error('rateLimit: unauthenticated request')
				}
				key = `adexRateLimit:${channel.id}:${session.uid}`
			} else if (type === 'ip') {
				if (events.length !== 1) {
					return new Error('rateLimit: only allows 1 event')
				}
				key = `adexRateLimit:${channel.id}:${session.ip}`
			} else {
				// unsupported limit type
				return null
			}

			if (await redisExists(key)) {
				return new Error('rateLimit: too many requests')
			}
			const seconds = Math.ceil(rule.rateLimit.timeframe / 1000)
			await redisSetex(key, seconds, '1')
			return null
		})
	).then(result => result.filter(e => e !== null))

	if (ifErr.length > 0) {
		return { success: false, statusCode: 429, message: ifErr[0].message }
	}

	return { success: true }
}

module.exports = checkAccess
