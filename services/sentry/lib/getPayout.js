/* eslint-disable no-nested-ternary */
const BN = require('bn.js')
const toBalancesKey = require('../toBalancesKey')

function getPayout(channel, ev) {
	if (ev.type === 'IMPRESSION' && ev.publisher) {
		// add the minimum price for the event to the current amount
		const minPrice = new BN(channel.spec.minPerImpression || 1)
		const maxPrice = new BN(channel.spec.maxPerImpression || 1)
		const price = channel.spec.priceMultiplicationRules
			? payout(channel.spec.priceMultiplicationRules, ev, maxPrice, minPrice)
			: new BN(channel.spec.minPerImpression || 1)
		return [toBalancesKey(ev.publisher), price]
	}
	if (ev.type === 'CLICK' && ev.publisher) {
		const minPrice = new BN(
			(channel.spec.pricingBounds && channel.spec.pricingBounds.CLICK.min) || 0
		)
		const maxPrice = new BN(
			(channel.spec.pricingBounds && channel.spec.pricingBounds.CLICK.max) || 0
		)
		const price = channel.spec.priceMultiplicationRules
			? payout(channel.spec.priceMultiplicationRules, ev, maxPrice, minPrice)
			: new BN((channel.spec.pricingBounds && channel.spec.pricingBounds.CLICK.min) || 0)
		return [toBalancesKey(ev.publisher), price]
	}
	return null
}

function payout(rules, ev, maxPrice, startPrice) {
	const match = isRuleMatching.bind(null, ev)
	const matchingRules = rules.filter(match)

	let finalPrice = startPrice

	if (matchingRules.length > 0) {
		const firstFixed = matchingRules.find(x => x.amount)
		const priceByRules = firstFixed
			? new BN(firstFixed.amount)
			: startPrice.mul(
					matchingRules
						.filter(x => x.multiplier)
						.map(x => x.multiplier)
						.reduce((a, b) => a.mul(b), 1)
			  )
		finalPrice = BN.min(maxPrice, priceByRules)
	}

	return finalPrice
}

function isRuleMatching(ev, rule) {
	return rule.eventType
		? rule.eventType.includes(ev.type)
		: true && rule.publisher
		? rule.publisher.includes(ev.publisher)
		: true && rule.osType
		? rule.osType.includes(ev.os)
		: true && rule.country
		? rule.country.includes(ev.country)
		: true
}

module.exports = getPayout
