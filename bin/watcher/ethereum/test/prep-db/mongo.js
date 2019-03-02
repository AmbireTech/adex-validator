const data = require('../mocks/deploy.json');
const fs = require('fs')

let dummyVals = {
	channel: {
		// @TODO: document schema
		_id: 'awesomeTestChannel',
		id: 'awesomeTestChannel',
		status: 'pending',
		depositAsset: 'DAI',
		depositAmount: 1000,
		validators: ['awesomeLeader', 'awesomeFollower'],
		spec: {
			validators: [
				{ id: 'awesomeLeader', url: 'http://localhost:8005', fee:  100 },
				{ id: 'awesomeFollower', url: 'http://localhost:8006', fee: 100 },
			]
        },
        watcher: {
            ethereum : {
                contract: ''
            }
        },
        created: Date.now(),
	}
}

dummyVals.channel._id = data.channelId
dummyVals.channel.id = data.channelId
dummyVals.channel.watcher.ethereum.contract = data.adexcore

const file = `
const data = ${JSON.stringify(dummyVals.channel)}

if (typeof(db) !== 'undefined') {
db.channels.insert(data)
}
`

fs.writeFileSync('./test/prep-db/seed.js', file);


if (typeof(module) !== 'undefined') module.exports = Object.freeze(dummyVals)