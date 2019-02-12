const BN = require('bn.js')

function newAggr(channelId) {
	return { channelId, created: new Date(), events: {} }
}

function reduce(userId, aggr, ev, channel) {
	// for now, we don't use userId
	// @TODO: this is one of the places to add other ev types
	if (ev.type === 'IMPRESSION') {
		aggr.events.IMPRESSION = mergeImpressionEv(aggr.events.IMPRESSION, ev, channel)
	}

	return aggr
}

function mergeImpressionEv(map, ev, channel) {
	if (typeof(ev.publisher)!=='string') return map
	if (!map) map = { eventCounts: {}, eventPayouts: {} }
	if (!map.eventCounts[ev.publisher]) map.eventCounts[ev.publisher] = 0
	if (!map.eventPayouts[ev.publisher]) map.eventPayouts[ev.publisher] = new BN(0)

	// increase the event count
	map.eventCounts[ev.publisher]++

	// calculate the amount payout	
	const currentAmount = map.eventPayouts[ev.publisher]
	const newAmount = (new BN(currentAmount, 10)).add(new BN(channel.minPerImpression || 1, 10))
	map.eventPayouts[ev.publisher] = newAmount.toString()
	return map
}

module.exports = { newAggr, reduce }
