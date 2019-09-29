const BN = require('bn.js')
const toBalancesKey = require('./toBalancesKey')

function newAggr(channelId) {
	return { channelId, created: new Date(), events: {} }
}

function reduce(channel, initialAggr, ev) {
	const aggr = { ...initialAggr }
	if (ev.type === 'IMPRESSION') {
		aggr.events.IMPRESSION = mergeImpressionEv(initialAggr.events.IMPRESSION, ev, channel)
	} else if (ev.type === 'CLOSE') {
		const { creator, depositAmount } = channel
		aggr.events.CLOSE = {
			eventCounts: {
				[toBalancesKey(creator)]: new BN(1)
			},
			eventPayouts: {
				[toBalancesKey(creator)]: depositAmount
			}
		}
	}

	return aggr
}

function mergeImpressionEv(initialMap = { eventCounts: {}, eventPayouts: {} }, ev, channel) {
	const map = {
		eventCounts: { ...initialMap.eventCounts },
		eventPayouts: { ...initialMap.eventPayouts }
	}
	if (typeof ev.publisher !== 'string') return map
	const earner = toBalancesKey(ev.publisher)
	if (!map.eventCounts[earner]) map.eventCounts[earner] = new BN(0)
	if (!map.eventPayouts[earner]) map.eventPayouts[earner] = new BN(0)

	// increase the event count
	const newEventCounts = new BN(map.eventCounts[earner], 10)
	map.eventCounts[earner] = addAndToString(newEventCounts, new BN(1))

	// current earner payout
	const currentAmount = new BN(map.eventPayouts[earner], 10)
	// add the minimum price per impression
	// to the current amount
	map.eventPayouts[earner] = addAndToString(
		currentAmount,
		new BN(channel.spec.minPerImpression || 1)
	)
	return map
}

function addAndToString(first, second) {
	return first.add(second).toString(10)
}

module.exports = { newAggr, reduce }
