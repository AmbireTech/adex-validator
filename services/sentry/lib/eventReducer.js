const BN = require('bn.js')
const toBalancesKey = require('../../toBalancesKey')

function newAggr(channelId) {
	return { channelId, created: new Date(), events: {}, totals: {}, earners: [] }
}

function reduce(channel, initialAggr, ev) {
	let aggr = { ...initialAggr }

	const payout = getPayout(channel, ev)
	if (payout) {
		aggr.events[ev.type] = mergeEv(initialAggr.events[ev.type], payout)
		aggr = { ...aggr, ...mergeToGlobalAcc(aggr, ev.type, payout) }
	}

	// Closing is a special case: we don't add it to the global accounting,
	// we simply pay the deposit back to the advertiser and count the event
	// When the Validator merges aggrs into the balance tree, it ensures it doesn't overflow the total deposit,
	// therefore only the remaining funds will be distributed back to the channel creator
	if (ev.type === 'CLOSE') {
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

module.exports = { newAggr, reduce }
