const BN = require('bn.js')
const db = require('../db')
const toBalancesKey = require('../services/toBalancesKey')

// eslint-disable-next-line no-console
const logError = console.error

async function init() {
	await db.connect()
	const aggrs = db.getMongo().collection('eventAggregates')

	const cur = aggrs.find(
		{
			earners: { $exists: false },
			events: { $exists: true }
		},
		{ _id: 1, 'events.IMPRESSION.eventCounts': 1, 'events.CLICK.eventCounts': 1 }
	)
	let o
	let count = 0
	// eslint-disable-next-line no-cond-assign, no-await-in-loop
	while ((o = await cur.next())) {
		const earners = Object.keys(o.events.IMPRESSION ? o.events.IMPRESSION.eventCounts : {})
			.map(toBalancesKey)
			.concat(Object.keys(o.events.CLICK ? o.events.CLICK.eventCounts : {}).map(toBalancesKey))
			.filter((x, i, a) => a.indexOf(x) === i)
		const totals = {}
		if (o.events.IMPRESSION) totals.IMPRESSION = toTotals(o.events.IMPRESSION)
		if (o.events.CLICK) totals.CLICK = toTotals(o.events.CLICK)
		// eslint-disable-next-line no-underscore-dangle
		aggrs.updateOne({ _id: o._id }, { $set: { earners, totals } }).catch(logError)
		// eslint-disable-next-line no-plusplus, no-console
		if (++count % 10000 === 0) console.log(count)
	}
	process.exit(0)
}

function toTotals(map) {
	if (!map) return null
	const { eventPayouts, eventCounts } = map
	return {
		eventCounts: sumBNValues(eventCounts).toString(10),
		eventPayouts: sumBNValues(eventPayouts).toString(10)
	}
}

function sumBNValues(obj = {}) {
	return Object.values(obj)
		.map(x => new BN(x, 10))
		.reduce((a, b) => a.add(b), new BN(0))
}

init().catch(logError)
