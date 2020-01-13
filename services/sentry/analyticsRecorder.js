const db = require('../../db')
const getPayout = require('./lib/getPayout')
const logger = require('../logger')('sentry')

const redisCli = db.getRedis()

function record(channel, session, events) {
	const batch = events
		.filter(ev => (ev.type === 'IMPRESSION' || ev.type === 'CLICK') && ev.publisher)
		.map(ev => {
			const payout = getPayout(channel, ev)
			// This should never happen, as the conditions we are checking for in the .filter are the same as getPayout's
			if (!payout) return []
			// @TODO is there a way to get rid of this ugly hardcode (10**18)?
			const MUL = 10 ** 18
			const payAmount = payout[1].toNumber() / MUL
			const adUnitRep = ev.adUnit
				? [
						// publisher -> ad unit -> impressions; answers which ad units are shown the most
						['zincrby', `reportPublisherToAdUnit:${ev.type}:${ev.publisher}`, 1, ev.adUnit],
						// campaignId -> ad unit -> impressions, clicks (will calculate %, CTR); answers which of the units performed best
						['zincrby', `reportChannelToAdUnit:${ev.type}:${channel.id}`, 1, ev.adUnit]
				  ]
				: []
			const adSlotRep = ev.adSlot
				? [
						// publisher -> ad slot -> impressions, clicks (will calculate %, CTR); answers which of my slots perform best
						['zincrby', `reportPublisherToAdSlot:${ev.type}:${ev.publisher}`, 1, ev.adSlot],
						[
							'zincrby',
							`reportPublisherToAdSlotPay:${ev.type}:${ev.publisher}`,
							payAmount,
							ev.adSlot
						]
				  ]
				: []
			// @TODO the country report needs to be time segmented otherwise it won't really be accurate
			const countryRep = session.country
				? [
						['zincrby', `reportPublisherToCountry:${ev.type}:${ev.publisher}`, 1, session.country]
						// @TODO collect payouts when we roll out mutable payments info
				  ]
				: []
			const ref = ev.ref || session.referrerHeader
			const hostname = ref ? ref.split('/')[2] : null
			const refRep = hostname
				? [
						// publisher -> hostname -> impressions; answers which websites (properties) perform best
						['zincrby', `reportPublisherToHostname:${ev.type}:${ev.publisher}`, 1, hostname],
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

module.exports = { record }
