/* eslint-disable no-nested-ternary */
const BN = require('bn.js')
const { evaluateMultiple } = require('adex-adview-manager/lib/rules')
const { targetingInputGetter, getPricingBounds } = require('adex-adview-manager/lib/helpers')
const toBalancesKey = require('../toBalancesKey')
const logger = require('../../logger')('sentry')

function getPayout(channel, ev, session) {
	if (!ev.publisher) return null
	const targetingRules = channel.targetingRules || channel.spec.targetingRules || []
	const eventType = ev.type.toUpperCase()
	const [minPrice, maxPrice] = getPricingBounds(channel, eventType)
	if (targetingRules.length === 0) return [toBalancesKey(ev.publisher), minPrice]

	const targetingInputBase = {
		// Some properties may not be passed, in which case they're undefined and
		// the rules are skipped with UndefinedVar error
		// This is a problem, since it means it's essentially a vulnerability: the rules would be bypassable
		// That's why we default them to ""
		adSlotId: ev.adSlot || '',
		adUnitId: ev.adUnit || '',
		// @TODO; we can infer that from the adUnit
		// adSlotType: adSlot.type,
		publisherId: ev.publisher || '',
		country: session.country || '',
		eventType,
		secondsSinceEpoch: Math.floor(Date.now() / 1000)
		// @TODO
		// userAgentOS: ua.os.name,
		// userAgentBrowserFamily: ua.browser.name,
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
	return [toBalancesKey(ev.publisher), price]
}

module.exports = getPayout
