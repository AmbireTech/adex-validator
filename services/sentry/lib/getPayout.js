/* eslint-disable no-nested-ternary */
const BN = require('bn.js')
const toBalancesKey = require('../toBalancesKey')

function getPayout(channel, ev, session) {
	if (ev.type && ev.publisher && ['IMPRESSION', 'CLICK'].includes(ev.type.toUpperCase())) {
		const [minPrice, maxPrice] = getPriceBounds(channel.spec, ev.type)
		const price = channel.spec.priceMultiplicationRules
			? payout(channel.spec.priceMultiplicationRules, ev, session, maxPrice, minPrice)
			: minPrice
		return [toBalancesKey(ev.publisher), new BN(price.toString())]
	}
	return null
}

function payout(rules, ev, session, maxPrice, startPrice) {
	const match = isRuleMatching.bind(null, ev, session)
	const matchingRules = rules.filter(match)
	let finalPrice = startPrice

	if (matchingRules.length > 0) {
		const divisionExponent = new BN(10).pow(new BN(18, 10))
		const firstFixed = matchingRules.find(x => x.amount)
		const priceByRules = firstFixed
			? new BN(firstFixed.amount)
			: startPrice
					.mul(
						new BN(
							(
								matchingRules
									.filter(x => x.multiplier)
									.map(x => x.multiplier)
									.reduce((a, b) => a * b, 1) * 1e18
							).toString()
						)
					)
					.div(divisionExponent)
		finalPrice = BN.min(maxPrice, priceByRules)
	}

	return finalPrice
}

function isRuleMatching(ev, session, rule) {
	return rule.evType
		? rule.evType.includes(ev.type.toLowerCase())
		: true && rule.publisher
		? rule.publisher.includes(ev.publisher)
		: true && rule.osType
		? rule.osType.includes(session.os && session.os.toLowerCase())
		: true && rule.country
		? rule.country.includes(session.country && session.country.toLowerCase())
		: true
}

function getPriceBounds(spec, evType) {
	const { pricingBounds, minPerImpression, maxPerImpression } = spec
	const fromPricingBounds = pricingBounds &&
		pricingBounds[evType] && [new BN(pricingBounds[evType].min), new BN(pricingBounds[evType].max)]
	if (evType === 'IMPRESSION') {
		return [new BN(minPerImpression || 1), new BN(maxPerImpression || 1)]
	}
	return fromPricingBounds || [new BN(0), new BN(0)]
}

module.exports = getPayout
