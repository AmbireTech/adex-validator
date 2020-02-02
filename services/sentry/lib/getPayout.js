const BN = require('bn.js')
const toBalancesKey = require('../toBalancesKey')

function getPayout(channel, ev) {
	if (ev.type === 'IMPRESSION' && ev.publisher) {
		// add the minimum price for the event to the current amount
		return [toBalancesKey(ev.publisher), new BN(channel.spec.minPerImpression || 1)]
	}
	if (ev.type === 'CLICK' && ev.publisher) {
		return [
			toBalancesKey(ev.publisher),
			new BN((channel.spec.pricingBounds && channel.spec.pricingBounds.CLICK.min) || 0)
		]
	}
	return null
}

module.exports = getPayout
