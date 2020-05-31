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
		adSlotId: ev.adSlot,
		adUnitId: ev.adUnit,
		// @TODO
		// adSlotType: adSlot.type,
		publisherId: ev.publisher,
		country: session.country,
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
		logger.error(`WARNING: rule for ${channel.id} failing with:`, e, rule)
	output = evaluateMultiple(input, output, targetingRules, onTypeErr)

	// @TODO: find a way to return a HTTP error code in this case
	if (output.show === false) return null

	const price = BN.max(minPrice, BN.min(maxPrice, output[priceKey]))
	return [toBalancesKey(ev.publisher), price]
}

module.exports = getPayout
