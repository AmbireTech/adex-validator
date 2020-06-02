#!/usr/bin/env node
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */

const db = require('../db')

// eslint-disable-next-line no-console
const { log } = console

async function shimTargeting() {
	await db.connect()

	const channelCol = db.getMongo().collection('channels')
	const channels = await channelCol.find()

	while (await channels.hasNext()) {
		const channel = await channels.next()
		const targetingRules = shimTargetingRules(channel)
		await channelCol.update({ _id: channel._id }, { $set: { targetingRules } })
	}
}

function shimTargetingRules(campaign) {
	let isCrypto = false
	let isStremio = false
	const countries = []
	for (const unit of campaign.spec.adUnits) {
		for (const tag of unit.targeting) {
			if (tag.tag === 'cryptocurrency' || tag.tag === 'crypto') {
				isCrypto = true
			}
			if (tag.tag === 'stremio' || tag.tag === 'stremio_user') {
				isStremio = true
			}
			if (tag.tag.startsWith('location_')) {
				countries.push(tag.tag.split('_')[1])
			}
		}
	}
	const isCatchAll = typeof campaign.name === 'string' ? campaign.name.includes('catchAll') : false
	const lowCpm = parseInt(campaign.spec.minPerImpression, 10) < 200000000000000
	const includeIncentivized = isCatchAll || (lowCpm && isCrypto)
	const rules = []
	// @TODO: consider adding categories for IAB12 - news, IAB13 - personal finance, ADX-1 - crypto, IAB1 - entertainment
	if (!includeIncentivized)
		rules.push({
			onlyShowIf: { nin: [{ get: 'adSlot.categories' }, 'Incentive'] }
		})
	if (!isCatchAll)
		rules.push({
			onlyShowIf: {
				gt: [{ get: 'adView.secondsSinceCampaignImpression' }, 900]
			}
		})
	if (isStremio && !campaign.minTargetingScore)
		rules.push({
			onlyShowIf: {
				in: [
					[
						'0xd5860D6196A4900bf46617cEf088ee6E6b61C9d6',
						'0xd5860d6196a4900bf46617cef088ee6e6b61c9d6'
					],
					{ get: 'publisherId' }
				]
			}
		})
	if (countries.length)
		rules.push({
			onlyShowIf: { in: [countries, { get: 'country' }] }
		})
	return rules
}

shimTargeting().then(() => {
	log(`Finished processing ${new Date()}`)
	process.exit()
})
