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
			: [
					{ uids: [channel.creator] },
					{ uids: null, rateLimit: cfg.IP_RATE_LIMIT },
					{ uids: null, rateLimit: cfg.SID_RATE_LIMIT }
			  ]
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

	let response = { success: true }

	for (let i = 0; i < rules.length; i += 1) {
		const rule = rules[i]
		const type = rule.rateLimit && rule.rateLimit.type
		const ourUid = session.uid || null
		let key

		// check if uid is allowed to submit whatever it likes
		if (rule.uids && rule.uids.length > 0 && rule.uids.includes(ourUid)) break

		// ip rateLimit
		if (rule && rule.rateLimit && type === 'ip') {
			if (events.length !== 1) {
				response = { success: false, statusCode: 429, message: 'rateLimit: only allows 1 event' }
				break
			}
			key = `adexRateLimit:${channel.id}:${session.ip}`
		}

		// session uid ratelimit
		if (rule && rule.rateLimit && type === 'sid') {
			// if unauthenticated reject request
			if (!session.uid) {
				response = {
					success: false,
					statusCode: 401,
					message: 'rateLimit: unauthenticated request'
				}
				break
			}
			// if authenticated then use ratelimit
			key = `adexRateLimit:${channel.id}:${session.uid}`
		}

		if (key) {
			// eslint-disable-next-line no-await-in-loop
			if (await redisExists(key)) {
				response = { success: false, statusCode: 429, message: 'rateLimit: too many requests' }
				break
			}
			const seconds = Math.ceil(rule.rateLimit.timeframe / 1000)
			// eslint-disable-next-line no-await-in-loop
			await redisSetex(key, seconds, '1')
		}
	}

	return response
}

module.exports = checkAccess
