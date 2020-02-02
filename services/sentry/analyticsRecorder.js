const { promisify } = require('util')
const db = require('../../db')
const getPayout = require('./lib/getPayout')
const toBalancesKey = require('./toBalancesKey')
const logger = require('../logger')('sentry')

const redisCli = db.getRedis()

function getEpoch() {
	return Math.floor(Date.now() / 2628000000)
}

function record(channel, session, events) {
	const batch = events
		.filter(ev => (ev.type === 'IMPRESSION' || ev.type === 'CLICK') && ev.publisher)
		.map(ev => {
			const payout = getPayout(channel, ev)
			const publisher = toBalancesKey(ev.publisher)
			// This should never happen, as the conditions we are checking for in the .filter are the same as getPayout's
			if (!payout) return []
			// @TODO is there a way to get rid of this ugly hardcode (10**18)?
			const MUL = 10 ** 18
			const payAmount = payout[1].toNumber() / MUL
			const adUnitRep = ev.adUnit
				? [
						// publisher -> ad unit -> impressions; answers which ad units are shown the most
						['zincrby', `reportPublisherToAdUnit:${ev.type}:${publisher}`, 1, ev.adUnit],
						// campaignId -> ad unit -> impressions, clicks (will calculate %, CTR); answers which of the units performed best
						['zincrby', `reportChannelToAdUnit:${ev.type}:${channel.id}`, 1, ev.adUnit]
				  ]
				: []
			const adSlotRep = ev.adSlot
				? [
						// publisher -> ad slot -> impressions, clicks (will calculate %, CTR); answers which of my slots perform best
						['zincrby', `reportPublisherToAdSlot:${ev.type}:${publisher}`, 1, ev.adSlot],
						['zincrby', `reportPublisherToAdSlotPay:${ev.type}:${publisher}`, payAmount, ev.adSlot]
				  ]
				: []
			// @TODO the country report needs to be time segmented otherwise it won't really be accurate
			const countryRep = session.country
				? [
						[
							'zincrby',
							`reportPublisherToCountry:${getEpoch()}:${ev.type}:${publisher}`,
							1,
							session.country
						]
						// @TODO collect payouts when we roll out mutable payments info
				  ]
				: []
			const ref = ev.ref || session.referrerHeader
			const hostname = ref ? ref.split('/')[2] : null
			const refRep = hostname
				? [
						// publisher -> hostname -> impressions; answers which websites (properties) perform best
						['zincrby', `reportPublisherToHostname:${ev.type}:${publisher}`, 1, hostname],
						// campaignId -> hostname -> impressions, clicks (will calculate %, CTR); answers on which websites did I spend my money on
						['zincrby', `reportChannelToHostname:${ev.type}:${channel.id}`, 1, hostname],
						['zincrby', `reportChannelToHostnamePay:${ev.type}:${channel.id}`, payAmount, hostname]
				  ]
				: []
			return adUnitRep
				.concat(adSlotRep)
				.concat(countryRep)
				.concat(refRep)
		})
		.reduce((a, b) => a.concat(b), [])
	if (batch.length)
		redisCli.batch(batch).exec(e => {
			if (e) logger.error(e)
		})
}

async function getAdvancedReports({ evType, publisher, channels = [] }) {
	const zrange = promisify(redisCli.zrange.bind(redisCli))
	const getStatsPair = async key => {
		const statsRaw = await zrange(key, 0, -1, 'withscores')
		const stats = Object.fromEntries(
			statsRaw.map((x, i, all) => (i % 2 === 0 ? [x, parseFloat(all[i + 1])] : null)).filter(x => x)
		)
		return [key.split(':')[0], stats]
	}
	const publisherKeys = publisher
		? [
				`reportPublisherToAdUnit:${evType}:${publisher}`,
				`reportPublisherToAdSlot:${evType}:${publisher}`,
				`reportPublisherToAdSlotPay:${evType}:${publisher}`,
				`reportPublisherToCountry:${getEpoch()}:${evType}:${publisher}`,
				`reportPublisherToHostname:${evType}:${publisher}`
		  ]
		: []
	const publisherStats = Object.fromEntries(await Promise.all(publisherKeys.map(getStatsPair)))
	const byChannelStats = Object.fromEntries(
		await Promise.all(
			channels.map(async channelId => {
				const keys = [
					`reportChannelToAdUnit:${evType}:${channelId}`,
					`reportChannelToHostname:${evType}:${channelId}`,
					`reportChannelToHostnamePay:${evType}:${channelId}`
				]
				return [channelId, Object.fromEntries(await Promise.all(keys.map(getStatsPair)))]
			})
		)
	)

	return { publisherStats, byChannelStats }
}

module.exports = { record, getAdvancedReports }
