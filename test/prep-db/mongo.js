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
		leader: '0xce07CbB7e054514D590a0262C93070D838bFBA2e',
		follower: '0xC91763D7F14ac5c5dDfBCD012e0D2A61ab9bDED3',
		guardian: '0xce07CbB7e054514D590a0262C93070D838bFBA2e',
		tokenAddr: '0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359',
		nonce: '0x0'
	}
}

if (typeof module !== 'undefined') module.exports = dummyVals
if (typeof db !== 'undefined') {
	db.channels.insert(Object.assign({ _id: dummyVals.channel.id }, dummyVals.channel))
}
