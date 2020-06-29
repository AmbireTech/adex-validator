/* eslint-disable no-nested-ternary */
const BN = require('bn.js')
const { evaluateMultiple } = require('adex-adview-manager/lib/rules')
const { targetingInputGetter, getPricingBounds } = require('adex-adview-manager/lib/helpers')
const toBalancesKey = require('../toBalancesKey')
const logger = require('../../logger')('sentry')

function getPayout(channel, ev, session) {
	if (!ev.publisher) return null
	let balancesKey = null
	try {
		balancesKey = toBalancesKey(ev.publisher)
	} catch (e) {
		logger.error(`WARNING: toBalancesKey is failing with ${e.message} on ${JSON.stringify(ev)}`)
	}
	if (!balancesKey) return null
	const targetingRules = channel.targetingRules || channel.spec.targetingRules || []
	const eventType = ev.type.toUpperCase()
	const [minPrice, maxPrice] = getPricingBounds(channel, eventType)
	if (targetingRules.length === 0) return [balancesKey, minPrice]

	const adUnit =
		Array.isArray(channel.spec.adUnits) && channel.spec.adUnits.find(u => u.ipfs === ev.adUnit)
	const targetingInputBase = {
		// Some properties may not be passed, in which case they're undefined and
		// the rules are skipped with UndefinedVar error
		// This is a problem, since it means it's essentially a vulnerability: the rules would be bypassable
		// That's why we default them to ""
		adSlotId: ev.adSlot || '',
		adUnitId: ev.adUnit || '',
		// the type of the slot is the same as the type of the unit
		adSlotType: adUnit ? adUnit.type : '',
		publisherId: ev.publisher || '',
		country: session.country || '',
		eventType,
		secondsSinceEpoch: Math.floor(Date.now() / 1000),
		// the UA parser will just set properties to undefined if user-agent is not passed; this is consisent with the Market's behavior
		// is not an issue since setting the user-agent to an arbitrary value is just as easy as not passing it
		userAgentOS: session.ua.os.name,
		userAgentBrowserFamily: session.ua.browser.name
	}
	const input = targetingInputGetter.bind(null, targetingInputBase, channel, null)
	const priceKey = `price.${eventType}`
	let output = {
		show: true,
		[priceKey]: minPrice
	}
	const onTypeErr = (e, rule) =>
		logger.error(
			`WARNING: rule for ${channel.id} failing with: ${e.message}; rule ${JSON.stringify(rule)}`
		)
	output = evaluateMultiple(input, output, targetingRules, onTypeErr)

	if (output.show === false) return null

	const price = BN.max(minPrice, BN.min(maxPrice, output[priceKey]))
	return [balancesKey, price]
}

module.exports = getPayout
