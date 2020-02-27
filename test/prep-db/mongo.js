/* eslint-disable no-undef */
/* eslint-disable prettier/prettier */

const dummyVals = {
	ids: {
		leader: '0xce07CbB7e054514D590a0262C93070D838bFBA2e',
		follower: '0xC91763D7F14ac5c5dDfBCD012e0D2A61ab9bDED3',
		user: '0x20754168c00a6e58116ccfd0a5f7d1bb66c5de9d',
		publisher: '0xb7d3f81e857692d13e9d63b232a90f4a1793189e',
		publisher2: '0x2054b0c1339309597ad04ba47f4590f8cdb4e305',
		creator: '0x033Ed90e0FeC3F3ea1C9b005C724D704501e0196',
	},
	auth: {
		leader: 'AUTH_awesomeLeader',
		follower: 'AUTH_awesomeFollower',
		user: 'x8c9v1b2',
		publisher: 'testing',
		publisher2: 'testing2',
		creator: '0x033Ed90e0FeC3F3ea1C9b005C724D704501e0196',
	},
	channel: {
		id: '0x061d5e2a67d0a9a10f1c732bca12a676d83f79663a396f7d87b3e30b9b411088',
		depositAsset: '0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359',
		depositAmount: '1000',
		creator: '0x033Ed90e0FeC3F3ea1C9b005C724D704501e0196',
		// UNIX timestamp for 2100-01-01
		validUntil: 4102444800,
		spec: {
			minPerImpression: '1',
			maxPerImpression: '10',
			pricingBounds: { CLICK: { min: '0', max: '0' } },
			withdrawPeriodStart: 4073414400000,
			validators: [
				{ id: '0xce07CbB7e054514D590a0262C93070D838bFBA2e', url: 'http://localhost:8005', fee: '100' },
				{ id: '0xC91763D7F14ac5c5dDfBCD012e0D2A61ab9bDED3', url: 'http://localhost:8006', fee: '100' },
			]
		}
	}
}

if (typeof module !== 'undefined') module.exports = dummyVals
if (typeof db !== 'undefined') {
	db.channels.insert(Object.assign({ _id: dummyVals.channel.id }, dummyVals.channel))
}
