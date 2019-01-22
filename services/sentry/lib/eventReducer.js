function newAggr(channelId) {
	return { channelId, created: new Date(), events: {} }
}

function reduce(userId, aggr, ev) {
	// for now, we don't use userId
	// @TODO: this is one of the places to add other ev types
	if (ev.type === 'IMPRESSION') {
		aggr.events.IMPRESSION = mergeImpressionEv(aggr.events.IMPRESSION, ev)
	}

	return aggr
}

function mergeImpressionEv(map, ev) {
	if (typeof(ev.publisher)!=='string') return map
	if (!map) map = {}
	if (!map[ev.publisher]) map[ev.publisher] = 0
	map[ev.publisher]++
	return map
}

module.exports = { newAggr, reduce }
