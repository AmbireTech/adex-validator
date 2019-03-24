const { mergeAggrs } = require('./lib/mergeAggrs')
const { toBNMap } = require('./lib')

async function tick(iface, channel) {
	const accounting = (await iface.getOurLatestMsg('Accounting')) || {
		balancesBeforeFees: {},
		balances: {},
		lastEvAggr: new Date(0)
	}

	// Process eventAggregates, from old to new, newer than the lastEvAggr time
	const aggrs = await iface.getEventAggrs({ after: accounting.lastEvAggr })

	logMerge(channel, aggrs)

	// mergeAggr will add all eventPayouts from aggrs to the balancesBeforeFees
	// and produce a new accounting message
	if (aggrs.length) {
		const { balances, newAccounting } = mergeAggrs(accounting, aggrs, channel)
		await iface.propagate([newAccounting])
		return { balances, newAccounting }
	}
	return { balances: toBNMap(accounting.balances) }
}

function logMerge(channel, eventAggrs) {
	if (eventAggrs.length === 0) return
	// eslint-disable-next-line no-console
	console.log(
		`validatorWorker: channel ${channel.id}: processing ${eventAggrs.length} event aggregates`
	)
}

module.exports = { tick }
