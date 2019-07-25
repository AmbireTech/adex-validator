const BN = require('bn.js')
const assert = require('assert')
const { eventTypes } = require('../../constants')

function newAggr(channelId) {
	return { channelId, created: new Date(), events: {} }
}

function reduce(channel, initialAggr, ev) {
	const aggr = { ...initialAggr }

	if (ev.type === eventTypes.IMPRESSION) {
		aggr.events.IMPRESSION = mergeEv(initialAggr.events.IMPRESSION, ev, channel)
	}

	if (ev.type === eventTypes.IMPRESSION_WITH_COMMISSION) {
		ev.earners.forEach(earner => {
			aggr.events.IMPRESSION = mergeEv(initialAggr.events.IMPRESSION, earner, channel)
		})
	}

	if (ev.type === eventTypes.CLOSE) {
		const { creator, depositAmount } = channel
		aggr.events.CLOSE = {
			eventCounts: {
				[creator]: new BN(1).toString()
			},
			eventPayouts: {
				[creator]: depositAmount
			}
		}
	}

	if (ev.type === eventTypes.PAY) {
		const { outputs } = ev
		const publishers = Object.keys(outputs)
		publishers.forEach(publisher => {
			aggr.events.PAY = mergeEv(
				initialAggr.events.PAY,
				{ publisher, output: outputs[publisher] },
				channel
			)
		})
	}

	if (ev.type === eventTypes.UPDATE_IMPRESSION_PRICE) {
		const price = new BN(ev.price, 10)
		assert.ok(isPriceOk(price, channel), 'invalid price per impression')
	}

	if (ev.type === eventTypes.IMPRESSION_PRICE_PER_CASE) {
		ev.cases.forEach(priceCase => {
			const price = new BN(priceCase.price, 10)
			assert.ok(isPriceOk(price, channel), 'invalid price per impression')
		})
	}

	return aggr
}
// price must be within the min and max price impression
function isPriceOk(price, channel) {
	const minPrice = new BN(channel.spec.minPerImpression, 10)
	const maxPrice = new BN(channel.spec.maxPerImpression, 10)

	return price.gte(minPrice) && price.lte(maxPrice)
}
// returns the price per impression
function getPrice(channel, ev) {
	let price = new BN(channel.currentPricePerImpression || channel.spec.minPerImpression, 10)
	if (channel.pricePerImpressionCase && ev.stat) {
		// check if there is a unique price case
		// for the event stat
		// it can be publisher prefixed for a specific publisher
		const result = channel.pricePerImpressionCase.find(
			priceCase => priceCase.stat === ev.stat || priceCase.stat === `${ev.publisher}:${ev.stat}`
		)
		// if there a match set price to the impression case
		price = result ? new BN(result.price, 10) : price
	}
	return price
}

function mergeEv(initialMap = { eventCounts: {}, eventPayouts: {}, eventStats: {} }, ev, channel) {
	const map = {
		eventCounts: { ...initialMap.eventCounts },
		eventPayouts: { ...initialMap.eventPayouts },
		eventStats: { ...initialMap.eventStats }
	}

	const price = getPrice(channel, ev)
	assert.ok(isPriceOk(price, channel), 'invalid price per impression')

	if (typeof ev.publisher !== 'string') return map

	const eventCountKey = ev.adUnit ? `${ev.publisher}:${ev.adUnit}` : ev.publisher
	if (!map.eventCounts[eventCountKey]) map.eventCounts[eventCountKey] = new BN(0)
	if (!map.eventPayouts[ev.publisher]) map.eventPayouts[ev.publisher] = new BN(0)
	if (!map.eventStats[ev.publisher]) {
		map.eventStats[ev.publisher] = []
	}
	map.eventStats[ev.publisher] = mergeStats(map.eventStats[ev.publisher], ev)
	// if its a pay event which requires output key
	// do not increase event count
	// else increase the event count
	if (!ev.output) {
		const newEventCounts = new BN(map.eventCounts[eventCountKey], 10)
		map.eventCounts[eventCountKey] = addAndToString(newEventCounts, new BN(1))
	}

	// current publisher payout
	const currentAmount = new BN(map.eventPayouts[ev.publisher], 10)
	// check if promilles is set that means payout
	// a percentage of the currentAmount to the publisher
	if (ev.promilles) {
		const publisherAmount = price.mul(new BN(ev.promilles, 10)).div(new BN(1000, 10))
		map.eventPayouts[ev.publisher] = addAndToString(currentAmount, publisherAmount)
	} else {
		// add the output if set (pay event) else
		// add the price per impression
		// to the current eventPayouts for the publisher
		map.eventPayouts[ev.publisher] = addAndToString(
			currentAmount,
			(ev.output && new BN(ev.output, 10)) || price
		)
	}
	return map
}

function mergeStats(eventStats, ev) {
	// eventStats [ { stat: 'android', count: 1} ]
	const stats = [...eventStats]
	const exists = stats.findIndex(stat => stat.stat === ev.stat)
	if (exists === -1) {
		stats.push({ stat: ev.stat, count: 1 })
	} else {
		stats[exists].count += 1
	}
	return stats
}

function addAndToString(first, second) {
	return first.add(second).toString(10)
}

module.exports = { newAggr, reduce }
