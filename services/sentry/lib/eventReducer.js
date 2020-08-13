const BN = require('bn.js')
const toBalancesKey = require('../toBalancesKey')
const { eventTypes } = require('../../constants')

function newAggr(channelId) {
	return { channelId, created: new Date(), events: {}, totals: {}, earners: [] }
}

function reduce(channel, initialAggr, evType, payout) {
	let aggr = { ...initialAggr }
	if (payout) {
		aggr.events[evType] = mergeEv(initialAggr.events[evType], payout)
		aggr = { ...aggr, ...mergeToGlobalAcc(aggr, evType, payout) }
	}

	// Closing is a special case: we don't add it to the global accounting,
	// we simply pay the deposit back to the advertiser and count the event
	// When the Validator merges aggrs into the balance tree, it ensures it doesn't overflow the total deposit,
	// therefore only the remaining funds will be distributed back to the channel creator
	// This is not what we'd call a payout (and not a result from getPayout); we don't want it reflected in the analytics
	if (evType === eventTypes.close) {
		const { creator, depositAmount } = channel
		const creatorBalanceKey = toBalancesKey(creator)
		aggr.events[eventTypes.close] = {
			eventCounts: {
				[creatorBalanceKey]: new BN(1).toString(10)
			},
			eventPayouts: {
				[creatorBalanceKey]: depositAmount
			}
		}
		if (!aggr.earners.includes(creatorBalanceKey)) aggr.earners.push(creatorBalanceKey)
	}

	return aggr
}

function mergeEv(initialMap = { eventCounts: {}, eventPayouts: {} }, [earner, amount]) {
	const map = {
		eventCounts: { ...initialMap.eventCounts },
		eventPayouts: { ...initialMap.eventPayouts }
	}
	if (!map.eventCounts[earner]) map.eventCounts[earner] = '0'
	if (!map.eventPayouts[earner]) map.eventPayouts[earner] = '0'

	// increase the event count
	const newEventCounts = new BN(map.eventCounts[earner], 10)
	map.eventCounts[earner] = addAndToString(newEventCounts, new BN(1))

	// current earner payout
	if (amount.gt(new BN(0))) {
		const currentAmount = new BN(map.eventPayouts[earner], 10)
		map.eventPayouts[earner] = addAndToString(currentAmount, amount)
	}
	return map
}

function mergeToGlobalAcc(aggr, evType, [earner, amount]) {
	const totals = aggr.totals
	if (!totals[evType])
		totals[evType] = {
			eventCounts: '0',
			eventPayouts: '0'
		}
	const totalsRecord = totals[evType]
	totalsRecord.eventCounts = addAndToString(new BN(totalsRecord.eventCounts, 10), new BN(1))
	totalsRecord.eventPayouts = addAndToString(new BN(totalsRecord.eventPayouts, 10), amount)

	const earners = aggr.earners
	if (!earners.includes(earner)) earners.push(earner)
	return { totals, earners }
}

function addAndToString(first, second) {
	return first.add(second).toString(10)
}

function isEmpty(aggr) {
	return aggr.earners.length === 0
}

module.exports = { newAggr, reduce, isEmpty }
