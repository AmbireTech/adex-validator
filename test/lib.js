const fetch = require('node-fetch')
const childproc = require('child_process')
const ethers = require('ethers')
const dummyVals = require('./prep-db/mongo')
const { ethereum } = require('../adapters')

const defaultPubName = dummyVals.ids.publisher

// note that the dummy adapter just requires the ID as an auth token
function fetchPost(url, authToken, body, headers = {}) {
	return fetch(url, {
		method: 'POST',
		headers: {
			authorization: `Bearer ${authToken}`,
			'content-type': 'application/json',
			...headers
		},
		body: JSON.stringify(body)
	})
}

function fetchWithAuth(url, authToken, headers = {}) {
	return fetch(url, {
		method: 'GET',
		headers: {
			authorization: `Bearer ${authToken}`,
			'content-type': 'application/json',
			...headers
		}
	})
}

function postEvents(url, channelId, events, auth = dummyVals.auth.creator, headers = {}) {
	// It is important to use creator auth, otherwise we'd hit rate limits
	return fetchPost(`${url}/channel/${channelId}/events`, auth, { events }, headers)
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
	const {
		RUST_VALIDATOR_WORKER,
		RUST_DOCKER_VALIDATOR_WORKER,
		LEADER_SENTRY,
		FOLLOWER_SENTRY
	} = process.env
	const leaderSentryUrl = LEADER_SENTRY || 'http://localhost:8005'
	const followerSentryUrl = FOLLOWER_SENTRY || 'http:///localhost:8006'

	let leaderTick = `./bin/validatorWorker.js --single-tick --adapter=dummy --dummyIdentity=${
		dummyVals.ids.leader
	} --sentryUrl=http://localhost:8005`
	let followerTick = `./bin/validatorWorker.js --single-tick --adapter=dummy --dummyIdentity=${
		dummyVals.ids.follower
	} --sentryUrl=http://localhost:8006`
	// using rust validator worker
	if (RUST_VALIDATOR_WORKER) {
		const onlyRun = process.env.RUST_ONLY_RUN
		if (!onlyRun || onlyRun === 'follower')
			leaderTick = `RUST_BACKTRACE=1 ${RUST_VALIDATOR_WORKER} -a dummy -i ${
				dummyVals.ids.leader
			} -u http://localhost:8005 -t`
		if (!onlyRun || onlyRun === 'leader')
			followerTick = `RUST_BACKTRACE=1 ${RUST_VALIDATOR_WORKER} -a dummy -i ${
				dummyVals.ids.follower
			} -u http://localhost:8006 -t`
	}

	// e.g. RUST_DOCKER_VALIDATOR_WORKER=docker-compose exec -it -f docker-compose.dev.yml adex-validator
	if (RUST_DOCKER_VALIDATOR_WORKER) {
		leaderTick = `${RUST_DOCKER_VALIDATOR_WORKER} /bin/sh -c "validator_worker -a dummy -i ${
			dummyVals.ids.leader
		} -u ${leaderSentryUrl} -t"`
		leaderTick = `${RUST_DOCKER_VALIDATOR_WORKER} /bin/sh -c "validator_worker -a dummy -i ${
			dummyVals.ids.follower
		} -u ${followerSentryUrl} -t"`
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
validUntil.setDate(validUntil.getDate() + 365)
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
	randomAddress,
	fetchWithAuth
}
