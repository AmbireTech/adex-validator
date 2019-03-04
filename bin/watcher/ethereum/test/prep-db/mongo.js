const data = require('../mocks/deploy.json');
const fs = require('fs')
const cfg = require('../../cfg')

let expiredDate = new Date()
expiredDate = expiredDate.setDate(expiredDate.getDate() - (cfg.EVICT_THRESHOLD + 20))

let dummyVals = {
	channel: [
		{
			// @TODO: document schema
			_id: '',
			id: '',
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
		},
		{
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
					contract: '0xweb'
				}
			},
			created: expiredDate,
		}
	]
}

// overwrite values 
dummyVals.channel[0]._id = data.channelId
dummyVals.channel[0].id = data.channelId
dummyVals.channel[0].watcher.ethereum.contract = data.adexcore

const file = `
const data = ${JSON.stringify(dummyVals.channel)}

if (typeof(db) !== 'undefined') {
db.channels.insertMany(data)
}
`

fs.writeFileSync('./test/prep-db/seed.js', file);


if (typeof(module) !== 'undefined') module.exports = Object.freeze(dummyVals)