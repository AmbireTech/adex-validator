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

	let response = { success: true }

	const checkRules = rules
		.map(rule => {
			const type = rule.rateLimit && rule.rateLimit.type
			const ourUid = session.uid || null

			if (rule.uids && rule.uids.length > 0 && rule.uids.includes(ourUid)) {
				// check if uid is allowed to submit whatever it likes
				return { allowAny: true }
			}

			if (rule && rule.rateLimit && type === 'ip') {
				if (events.length !== 1) {
					return new Error('rateLimit: only allows 1 event')
				}
			}

			if (rule && rule.rateLimit && type === 'sid') {
				// if unauthenticated reject request
				if (!session.uid) {
					return new Error('rateLimit: unauthenticated request')
				}
			}
			return null
		})
		.filter(e => e !== null)

	if (checkRules.find(e => e.allowAny === true)) return response

	if (checkRules.length > 0) {
		// return the first error message
		response = { success: false, statusCode: 429, message: checkRules[0].message }
		return response
	}

	const limitKeys = rules
		.map(rule => {
			const type = rule.rateLimit && rule.rateLimit.type

			if (rule && rule.rateLimit && type === 'sid') {
				return { rule, key: `adexRateLimit:${channel.id}:${session.uid}` }
			}

			if (rule && rule.rateLimit && type === 'ip') {
				return { rule, key: `adexRateLimit:${channel.id}:${session.ip}` }
			}

			return null
		})
		.filter(e => e !== null)

	if (limitKeys.length === 0) return response

	const ifErr = await Promise.all(
		limitKeys.map(async limitKey => {
			const { rule, key } = limitKey
			if (await redisExists(key)) {
				return new Error('rateLimit: too many requests')
			}
			const seconds = Math.ceil(rule.rateLimit.timeframe / 1000)
			await redisSetex(key, seconds, '1')
			return null
		})
	).then(result => result.filter(e => e !== null))

	if (ifErr.length === 0) return response

	response = { success: false, statusCode: 429, message: ifErr[0].message }
	return response
}

module.exports = checkAccess
