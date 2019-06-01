/* eslint-disable no-undef */
/* eslint-disable prettier/prettier */

const dummyVals = {
	ids: {
		leader: 'awesomeLeader',
		follower: 'awesomeFollower',
		user: 'awesomeTestUser',
		publisher: 'myAwesomePublisher',
		publisher2: 'myAwesomePublisher2',
		creator: 'awesomeCreator',
	},
	auth: {
		leader: 'AUTH_awesomeLeader',
		follower: 'AUTH_awesomeFollower',
		user: 'x8c9v1b2',
		publisher: 'testing',
		publisher2: 'testing2',
		creator: 'awesomeCreator',
	},
	channel: {
		id: 'awesomeTestChannel',
		depositAsset: 'DAI',
		depositAmount: '1000',
		creator: 'awesomeCreator',
		// UNIX timestamp for 2100-01-01
		validUntil: 4102444800,
		spec: {
            minPerImpression: '1',
            maxPerImpression: '10',
			withdrawPeriodStart: 4073414400000,
			validators: [
				{ id: 'awesomeLeader', url: 'http://localhost:8005', fee: '100' },
				{ id: 'awesomeFollower', url: 'http://localhost:8006', fee: '100' },
			]
		}
	}
}

if (typeof module !== 'undefined') module.exports = dummyVals
if (typeof db !== 'undefined') {
	db.channels.insert(Object.assign({ _id: dummyVals.channel.id }, dummyVals.channel))
}
