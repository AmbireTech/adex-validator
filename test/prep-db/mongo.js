db.sessions.insert({ _id: 'x8c9v1b2', uid: 'awesomeTestUser' })

db.sessions.insert({ _id: 'AUTH_awesomeLeader', uid: 'awesomeLeader' })
db.sessions.insert({ _id: 'AUTH_awesomeFollower', uid: 'awesomeFollower' })

db.channels.insert({
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
})

