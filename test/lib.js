const fetch = require('node-fetch')
const childproc = require('child_process')
const dummyVals = require('./prep-db/mongo')

const defaultPubName = dummyVals.ids.publisher
function postEvents(url, channelId, events) {
	return fetch(`${url}/channel/${channelId}/events`, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${dummyVals.auth.user}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify({ events })
	})
}

function genImpressions(n, pubName) {
	const events = []
	for (let i = 0; i < n; i += 1)
		events.push({
			type: 'IMPRESSION',
			publisher: pubName || defaultPubName
		})
	return events
}

function getDummySig(hash, from) {
	return `Dummy adapter signature for ${hash} by ${from}`
}

function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

function exec(cmd) {
	return new Promise((resolve, reject) => {
		const proc = childproc.exec(cmd, err => (err ? reject(err) : resolve()))
		proc.stdout.pipe(process.stdout)
		proc.stderr.pipe(process.stderr)
	})
}

function forceTick() {
	return Promise.all([
		exec(
			`./bin/validatorWorker.js --single-tick --adapter=dummy --dummyIdentity=awesomeLeader --sentryUrl=http://localhost:8005`
		),
		exec(
			`./bin/validatorWorker.js --single-tick --adapter=dummy --dummyIdentity=awesomeFollower --sentryUrl=http://localhost:8006`
		)
	])
}

module.exports = {
	postEvents,
	genImpressions,
	getDummySig,
	forceTick,
	wait
}
