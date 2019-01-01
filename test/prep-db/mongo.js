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
	},
	channel: {
		// @TODO: document schema
		_id: 'awesomeTestChannel',
		id: 'awesomeTestChannel',
		status: 'live',
		// @TODO: ERC20 addr
		depositAsset: 'DAI',
		depositAmount: 1000,
		validators: ['awesomeLeader', 'awesomeFollower'],
		spec: {
			validators: [
				{ id: 'awesomeLeader', url: 'http://localhost:8005' },
				{ id: 'awesomeFollower', url: 'http://localhost:8006' },
			]
		}
	}

}

if (typeof(module) !== 'undefined') module.exports = dummyVals
if (typeof(db) !== 'undefined') {
	db.sessions.insert({ _id: dummyVals.auth.user, uid: dummyVals.ids.user })
	db.sessions.insert({ _id: dummyVals.auth.leader, uid: dummyVals.ids.leader })
	db.sessions.insert({ _id: dummyVals.auth.follower, uid: dummyVals.ids.follower })

	db.channels.insert(dummyVals.channel)
}
