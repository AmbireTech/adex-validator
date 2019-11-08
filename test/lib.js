const fetch = require('node-fetch')
const childproc = require('child_process')
const ethers = require('ethers')
const dummyVals = require('./prep-db/mongo')
const { ethereum } = require('../adapters')

const defaultPubName = dummyVals.ids.publisher

// note that the dummy adapter just requires the ID as an auth token
function fetchPost(url, authToken, body) {
	return fetch(url, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${authToken}`,
			'content-type': 'application/json'
		},
		body: JSON.stringify(body)
	})
}

function postEvents(url, channelId, events, auth = dummyVals.auth.creator) {
	// It is important to use creator auth, otherwise we'd hit rate limits
	return fetchPost(`${url}/channel/${channelId}/events`, auth, { events })
}

function genEvents(n, pubName, type = 'IMPRESSION') {
	const events = []
	for (let i = 0; i < n; i += 1)
		events.push({
			type,
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
	let leaderTick = `./bin/validatorWorker.js --single-tick --adapter=dummy --dummyIdentity=${
		dummyVals.ids.leader
	} --sentryUrl=http://localhost:8005`
	let followerTick = `./bin/validatorWorker.js --single-tick --adapter=dummy --dummyIdentity=${
		dummyVals.ids.follower
	} --sentryUrl=http://localhost:8006`
	// using rust validator worker
	if (process.env.RUST_VALIDATOR_WORKER) {
		leaderTick = `RUST_BACKTRACE=1 ${process.env.RUST_VALIDATOR_WORKER} -a dummy -i ${
			dummyVals.ids.leader
		} -u http://localhost:8005 -t`
		followerTick = `RUST_BACKTRACE=1 ${process.env.RUST_VALIDATOR_WORKER} -a dummy -i ${
			dummyVals.ids.follower
		} -u http://localhost:8006 -t`
	}

	return Promise.all([exec(leaderTick), exec(followerTick)])
}

function randomAddress() {
	return ethers.Wallet.createRandom().address
}

function getValidEthChannel() {
	const channel = {
		...dummyVals.channel,
		id: null,
		validUntil,
		spec: {
			...dummyVals.channel.spec,
			withdrawPeriodStart,
			nonce: Date.now().toString()
		}
	}

	const ethChannel = ethereum.toEthereumChannel(channel)
	// Just a hardcoded core addr is fine here; we don't need for more than the hash
	const coreAddr = '0x333420fc6a897356e69b62417cd17ff012177d2b'
	channel.id = ethChannel.hashHex(coreAddr)
	return channel
}

let validUntil = new Date()
validUntil.setFullYear(validUntil.getFullYear() + 1)
validUntil = Math.floor(validUntil.getTime() / 1000)

let withdrawPeriodStart = new Date()
withdrawPeriodStart.setMonth(withdrawPeriodStart.getMonth() + 6)
withdrawPeriodStart = withdrawPeriodStart.getTime()

module.exports = {
	postEvents,
	genEvents,
	getDummySig,
	forceTick,
	wait,
	fetchPost,
	exec,
	validUntil,
	withdrawPeriodStart,
	getValidEthChannel,
	randomAddress
}
