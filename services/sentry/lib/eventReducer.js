const BN = require('bn.js')
const assert = require('assert')
const db = require('../../../db')

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
				[creator]: new BN(1).toString()
			},
			eventPayouts: {
				[creator]: depositAmount
			}
		}
	} else if (ev.type === 'UPDATE_IMPRESSION_PRICE') {
		const price = new BN(ev.price, 10)
		assert.ok(isPriceOk(price, channel), 'invalid price per impression')
		// set the current price per impression
		const channelsCol = db.getMongo().collection('channels')
		channelsCol
			.updateOne({ id: channel.id }, { $set: { currentPricePerImpression: ev.price } })
			.then(function() {})
	}

	return aggr
}
// price must be within the min and max price impression
function isPriceOk(price, channel) {
	const minPrice = new BN(channel.spec.minPerImpression, 10)
	const maxPrice = new BN(channel.spec.maxPerImpression, 10)

	return price.gte(minPrice) && price.lte(maxPrice)
}

function mergeImpressionEv(initialMap = { eventCounts: {}, eventPayouts: {} }, ev, channel) {
	const map = {
		eventCounts: { ...initialMap.eventCounts },
		eventPayouts: { ...initialMap.eventPayouts }
	}

	const price = new BN(channel.currentPricePerImpression || channel.spec.minPerImpression, 10)
	assert.ok(isPriceOk(price, channel), 'invalid price per impression')

	if (typeof ev.publisher !== 'string') return map
	if (!map.eventCounts[ev.publisher]) map.eventCounts[ev.publisher] = new BN(0)
	if (!map.eventPayouts[ev.publisher]) map.eventPayouts[ev.publisher] = new BN(0)

	// increase the event count
	const newEventCounts = new BN(map.eventCounts[ev.publisher], 10)
	map.eventCounts[ev.publisher] = addAndToString(newEventCounts, new BN(1))

	// current publisher payout
	const currentAmount = new BN(map.eventPayouts[ev.publisher], 10)
	// add the price per impression
	// to the current eventPayouts for the publisher
	map.eventPayouts[ev.publisher] = addAndToString(currentAmount, price)
	return map
}

function addAndToString(first, second) {
	return first.add(second).toString(10)
}

module.exports = { newAggr, reduce }
