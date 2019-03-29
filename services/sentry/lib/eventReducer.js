const BN = require('bn.js')

function newAggr(channelId) {
	return { channelId, created: new Date(), events: {} }
}

function reduce(userId, channel, initialAggr, ev) {
	const aggr = { ...initialAggr }
	// for now, we don't use userId
	// @TODO: this is one of the places to add other ev types
	if (ev.type === 'IMPRESSION') {
		aggr.events.IMPRESSION = mergeImpressionEv(initialAggr.events.IMPRESSION, ev, channel)
	} else if (ev.type === 'CLOSE_CHANNEL') {
		const { creator, depositAmount } = channel
		aggr.events.CLOSE_CHANNEL = {
			eventCounts: {
				[creator]: new BN(1)
			},
			eventPayouts: {
				[creator]: depositAmount
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
	if (!map.eventCounts[ev.publisher]) map.eventCounts[ev.publisher] = new BN(0)
	if (!map.eventPayouts[ev.publisher]) map.eventPayouts[ev.publisher] = new BN(0)

	// increase the event count
	const newEventCounts = new BN(map.eventCounts[ev.publisher], 10)
	map.eventCounts[ev.publisher] = addAndToString(newEventCounts, new BN(1))

	// current publisher payout
	const currentAmount = new BN(map.eventPayouts[ev.publisher], 10)
	// add the minimum price per impression
	// to the current amount
	map.eventPayouts[ev.publisher] = addAndToString(
		currentAmount,
		new BN(channel.spec.minPerImpression || 1)
	)
	return map
}

function addAndToString(first, second) {
	return first.add(second).toString(10)
}

module.exports = { newAggr, reduce }
