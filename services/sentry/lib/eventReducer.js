const BN = require('bn.js')
const toBalancesKey = require('./toBalancesKey')

function newAggr(channelId) {
	return { channelId, created: new Date(), events: {} }
}

function reduce(channel, initialAggr, ev) {
	const aggr = { ...initialAggr }
	if (ev.type === 'IMPRESSION') {
		// add the minimum price for the event to the current amount
		const payout = new BN(channel.spec.minPerImpression || 1)
		aggr.events.IMPRESSION = mergeEv(initialAggr.events.IMPRESSION, ev, payout)
	} else if (ev.type === 'CLICK') {
		const payout = new BN((channel.spec.pricingBounds && channel.spec.pricingBounds.CLICK.min) || 0)
		aggr.events.CLICK = mergeEv(initialAggr.events.CLICK, ev, payout)
	} else if (ev.type === 'CLOSE') {
		const { creator, depositAmount } = channel
		aggr.events.CLOSE = {
			eventCounts: {
				[toBalancesKey(creator)]: new BN(1).toString(10)
			},
			eventPayouts: {
				[toBalancesKey(creator)]: depositAmount
			}
		}
	}

	return aggr
}

function mergeEv(initialMap = { eventCounts: {}, eventPayouts: {} }, ev, payout) {
	const map = {
		eventCounts: { ...initialMap.eventCounts },
		eventPayouts: { ...initialMap.eventPayouts }
	}
	if (typeof ev.publisher !== 'string') return map
	const earner = toBalancesKey(ev.publisher)
	if (!map.eventCounts[earner]) map.eventCounts[earner] = '0'
	if (!map.eventPayouts[earner]) map.eventPayouts[earner] = '0'

	// increase the event count
	const newEventCounts = new BN(map.eventCounts[earner], 10)
	map.eventCounts[earner] = addAndToString(newEventCounts, new BN(1))

	// current earner payout
	if (payout.gt(new BN(0))) {
		const currentAmount = new BN(map.eventPayouts[earner], 10)
		map.eventPayouts[earner] = addAndToString(currentAmount, payout)
	}
	return map
}

function addAndToString(first, second) {
	return first.add(second).toString(10)
}

module.exports = { newAggr, reduce }
