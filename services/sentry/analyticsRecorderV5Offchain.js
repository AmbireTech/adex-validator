const db = require('../../db')
const toBalancesKey = require('./toBalancesKey')
const logger = require('../logger')('sentry')

function getHourEpoch() {
	return Math.floor(Date.now() / 3600000)
}

const linuxDistros = [
	'Arch',
	'CentOS',
	'Slackware',
	'Fedora',
	'Debian',
	'Deepin',
	'elementary OS',
	'Gentoo',
	'Mandriva',
	'Manjaro',
	'Mint',
	'PCLinuxOS',
	'Raspbian',
	'Sabayon',
	'SUSE',
	'Ubuntu',
	'RedHat'
]
const whitelisted = [
	'Android',
	'Android-x86',
	'iOS',
	'BlackBerry',
	'Chromium OS',
	'Fuchsia',
	'Mac OS',
	'Windows',
	'Windows Phone',
	'Windows Mobile',
	'Linux',
	'NetBSD',
	'Nintendo',
	'OpenBSD',
	'PlayStation',
	'Tizen',
	'Symbian',
	'KAIOS'
]
// eslint-disable-next-line no-unused-vars
function mapOS(osName) {
	if (linuxDistros.includes(osName)) return 'Linux'
	if (whitelisted.includes(osName)) return osName
	return 'Other'
}

// TEMP: there wil be no channel it is the campaign object adex-common
function record(channel, session, events, payouts) {
	const analyticsCol = db.getMongo().collection('analytics')

	const osName = mapOS(session.ua.os.name)
	const time = new Date(getHourEpoch() * 3600000)

	const batch = events
		.filter(ev => (ev.type === 'IMPRESSION' || ev.type === 'CLICK') && ev.publisher)
		.map((ev, i) => {
			const payout = payouts[i]
			// In DSP mode this should be as (ADEX), in ZK mode the premium publisher
			const publisher = toBalancesKey(ev.publisher)
			// This should never happen, as the conditions we are checking for in the .filter are the same as getPayout's
			if (!payout) return Promise.resolve()
			// @TODO is there a way to get rid of this ugly hardcode (10**18)?
			const MUL = 10 ** channel.depositAssetDecimals || 6
			const payAmount = parseInt(payout[1].toString(), 10) / MUL
			// NOTE: copied from getPayout
			const adUnit =
				Array.isArray(channel.adUnits) &&
				channel.adUnits.find(u => u.ipfs === ev.adUnit || u.id === ev.adUnit)
			const ref = ev.ref || session.referrerHeader
			const hostname = ev.hostname || (ref ? ref.split('/')[2] : null)
			const ssp = ev.ssp
			const sspPublisher = ev.sspPublisher
			const placement = ev.placement
			const country = ev.country || session.country || 'unknown'

			return analyticsCol.updateOne(
				{
					keys: {
						time,
						campaignId: channel.id,
						adUnit: ev.adUnit,
						adSlot: ev.adSlot,
						adSlotType: adUnit ? adUnit.type : '',
						advertiser: channel.creator,
						/** account addr 0x... */
						publisher,
						/** ssp id - from adex dsp */
						ssp,
						/** internal id for the specific publisher of the ssp */
						sspPublisher,
						/** hostname or app domain ot app bundle */
						hostname,
						placement,
						country,
						osName
					}
				},
				{ $inc: { [`${ev.type}.paid`]: payAmount, [`${ev.type}.count`]: 1 } },
				{ upsert: true }
			)
		})
	return Promise.all(batch).catch(e => logger.error(e))
}

module.exports = { record }
