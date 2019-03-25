/* eslint-disable no-undef */
/* eslint-disable prettier/prettier */

const dummyVals = {
	ids: {
		leader: 'awesomeLeader',
		follower: 'awesomeFollower',
		user: 'awesomeTestUser',
		publisher: 'myAwesomePublisher'
	},
	auth: {
		leader: 'AUTH_awesomeLeader',
		follower: 'AUTH_awesomeFollower',
		user: 'x8c9v1b2',
		publisher: 'testing'
	},
	channel: {
		// @TODO: document schema
		_id: 'awesomeTestChannel',
		id: 'awesomeTestChannel',
		depositAsset: 'DAI',
		depositAmount: 1000,
		creator: 'awesomeCreator',
		created: new Date(),
		spec: {
			validators: [
				{ id: 'awesomeLeader', url: 'http://localhost:8005', fee: 100 },
				{ id: 'awesomeFollower', url: 'http://localhost:8006', fee: 100 },
			]
		}
	}
}

if (typeof module !== 'undefined') module.exports = dummyVals
if (typeof db !== 'undefined') {
	db.channels.insert(dummyVals.channel)
}
