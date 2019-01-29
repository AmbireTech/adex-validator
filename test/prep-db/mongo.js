let dummyVals = {
	ids: {
		leader: 'awesomeLeader',
		follower: 'awesomeFollower',
		user: 'awesomeTestUser',
		publisher: 'myAwesomePublisher',
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
		status: 'live',
		depositAsset: 'DAI',
		depositAmount: 1000,
		validators: ['awesomeLeader', 'awesomeFollower'],
		spec: {
			validators: [
				{ id: 'awesomeLeader', url: 'http://localhost:8005' },
				{ id: 'awesomeFollower', url: 'http://localhost:8006' },
			]
		}
	},
}

dummyVals['sessions'] = [
	{ _id: `${dummyVals.auth.user}`, uid: `${dummyVals.ids.user}` },
	{ _id: `${dummyVals.auth.publisher}`,  uid: `${dummyVals.ids.publisher}` },
	{ _id: `${dummyVals.auth.leader}`, uid: `${dummyVals.ids.leader}` },
	{ _id: `${dummyVals.auth.follower}`, uid: `${dummyVals.ids.follower}`}
]

if (typeof(module) !== 'undefined') module.exports = Object.freeze(dummyVals)
if (typeof(db) !== 'undefined') {
	db.channels.insert(dummyVals.channel)
	db.sessions.insertMany(dummyVals.sessions)
}
