const dummyVals = {
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
	sessions: [
		{ _id: 'x8c9v1b2', uid: 'awesomeTestUser' },
		{ _id: 'testing',  uid: 'myAwesomePublisher' },
		{ _id: 'AUTH_awesomeLeader', uid: 'awesomeLeader' },
		{ _id: 'AUTH_awesomeFollower', uid: 'awesomeFollower' }
	]
}

if (typeof(module) !== 'undefined') module.exports = dummyVals
if (typeof(db) !== 'undefined') {
	db.channels.insert(dummyVals.channel)
	db.sessions.insertMany(dummyVals.sessions)
}
