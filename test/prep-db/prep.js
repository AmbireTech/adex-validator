#!/usr/bin/env node

const fs = require('fs')

const validUntil = new Date()
validUntil.setFullYear(validUntil.getFullYear() + 1)
const withdrawPeriodStart = new Date()
withdrawPeriodStart.setMonth(withdrawPeriodStart.getMonth() + 6)

fs.writeFileSync(
	'./test/prep-db/mongo.js',
	`
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
		// UNIX timestamp for in one year
		validUntil: ${Math.floor(validUntil.getTime() / 1000)},
		spec: {
			minPerImpression: '1',
			withdrawPeriodStart: ${withdrawPeriodStart.getTime()},
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
`
)
