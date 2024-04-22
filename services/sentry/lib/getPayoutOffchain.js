const toBalancesKey = require('../toBalancesKey')
const logger = require('../../logger')('sentry')
const { eventTypes } = require('../../constants')

const PAYOUT_EVENT_TYPES = {
	[eventTypes.impression]: true,
	[eventTypes.click]: true
}

function getPayoutOffchain(channel, ev) {
	// No need to upper case as the event schema is validating the event type
	const eventType = ev.type
	if (!ev.publisher || !PAYOUT_EVENT_TYPES[eventType]) return null
	let balancesKey = null
	try {
		balancesKey = toBalancesKey(ev.publisher)
	} catch (e) {
		logger.error(`WARNING: toBalancesKey is failing with ${e.message} on ${JSON.stringify(ev)}`)
	}
	if (!balancesKey) return null

	const price = ev.price
	return [balancesKey, price]
}

module.exports = getPayoutOffchain
