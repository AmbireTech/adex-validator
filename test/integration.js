#!/usr/bin/env node
const tape = require('tape-catch')
const fetch = require('node-fetch')
const { Channel, MerkleTree } = require('adex-protocol-eth/js')
const { getStateRootHash } = require('../services/validatorWorker/lib')
const dummyAdapter = require('../adapters/dummy')
const {
	forceTick,
	wait,
	postEvents,
	genImpressions,
	getDummySig,
	filterRejectStateMsg
} = require('./lib')
const cfg = require('../cfg')
const dummyVals = require('./prep-db/mongo')

const leaderUrl = dummyVals.channel.spec.validators[0].url
const followerUrl = dummyVals.channel.spec.validators[1].url
const defaultPubName = dummyVals.ids.publisher
const expectedDepositAmnt = dummyVals.channel.depositAmount

function aggrAndTick() {
	// If we need to run the production config with AGGR_THROTTLE, then we need to wait for cfg.AGGR_THROTTLE + 500
	// the reason is that in production we have a throttle for saving event aggregates
	if (process.env.NODE_ENV === 'production') {
		return wait(cfg.AGGR_THROTTLE + cfg.WAIT_TIME).then(forceTick)
	}
	return forceTick()
}

tape('submit events and ensure they are accounted for', function(t) {
	const evs = genImpressions(3).concat(genImpressions(2, 'anotherPublisher'))
	const expectedBal = '3'
	const expectedBalAfterFees = '2'

	const channel = dummyVals.channel
	let balancesTreePreFees
	let balancesTree

	Promise.all(
		// @TODO maybe we should assert that the status is 200 here?
		[leaderUrl, followerUrl].map(url => postEvents(url, dummyVals.channel.id, evs))
	)
		.then(() => aggrAndTick())
		.then(function() {
			return fetch(
				`${leaderUrl}/channel/${dummyVals.channel.id}/validator-messages/awesomeLeader/Accounting`
			)
				.then(res => res.json())
				.then(({ validatorMessages }) => validatorMessages[0].msg)
		})
		.then(function(resp) {
			t.ok(resp && resp.balances, 'there is a balances tree')
			balancesTreePreFees = resp.balancesBeforeFees
			balancesTree = resp.balances
			t.equal(balancesTreePreFees[defaultPubName], expectedBal, 'balances is right')
			// We will check the leader, cause this means this happened:
			// the NewState was generated, sent to the follower,
			// who generated ApproveState and sent back to the leader
			return aggrAndTick().then(function() {
				return fetch(`${leaderUrl}/channel/${dummyVals.channel.id}/last-approved`).then(res =>
					res.json()
				)
			})
		})
		.then(function({ lastApproved }) {
			t.ok(lastApproved, 'has lastApproved')
			// ensure NewState is in order
			const lastNew = lastApproved.newState
			t.ok(lastNew, 'has NewState')
			t.equal(lastNew.from, channel.validators[0], 'NewState: is by the leader')
			t.ok(
				typeof lastNew.msg.stateRoot === 'string' && lastNew.msg.stateRoot.length === 64,
				'NewState: stateRoot is sane'
			)
			t.equal(
				lastNew.msg.signature,
				getDummySig(lastNew.msg.stateRoot, lastNew.from),
				'NewState: signature is sane'
			)
			t.equal(
				lastNew.msg.balances[defaultPubName],
				expectedBalAfterFees,
				'NewState: balance is as expected, after fees'
			)
			t.deepEqual(
				lastNew.msg.balances,
				balancesTree,
				'NewState: balances is the same as the one in Accounting'
			)

			// Ensure ApproveState is in order
			const lastApprove = lastApproved.approveState
			t.ok(lastApprove, 'has ApproveState')
			t.equal(lastApprove.from, channel.validators[1], 'ApproveState: is by the follower')
			t.ok(
				typeof lastApprove.msg.stateRoot === 'string' && lastApprove.msg.stateRoot.length === 64,
				'ApproveState: stateRoot is sane'
			)
			t.equal(
				lastApprove.msg.signature,
				getDummySig(lastApprove.msg.stateRoot, lastApprove.from),
				'ApproveState: signature is sane'
			)
			t.equal(
				lastNew.msg.stateRoot,
				lastApprove.msg.stateRoot,
				'stateRoot is the same between latest NewState and ApproveState'
			)
			t.equal(lastApprove.msg.isHealthy, true, 'ApproveState: health value is true')

			// Check inclusion proofs of the balance
			// stateRoot = keccak256(channelId, balanceRoot)
			const allLeafs = Object.keys(balancesTree).map(k =>
				Channel.getBalanceLeaf(k, balancesTree[k])
			)
			const mTree = new MerkleTree(allLeafs)
			const stateRootRaw = Channel.getSignableStateRoot(
				Buffer.from(channel.id),
				mTree.getRoot()
			).toString('hex')
			const { stateRoot } = lastNew.msg
			t.equals(stateRootRaw, stateRoot, 'stateRoot matches merkle tree root')

			// @TODO: revert this to what it was before the fees, since fees will be moved to a separate test path
			// this is a bit out of scope, looks like a test of the MerkleTree lib,
			// but better be safe than sorry
			const expectedBalanceAfterFees = '2'
			const leaf = Channel.getBalanceLeaf(defaultPubName, expectedBalanceAfterFees)
			const proof = mTree.proof(leaf)
			t.ok(mTree.verify(proof, leaf), 'balance leaf is in stateRoot')

			t.end()
		})
		.catch(err => t.fail(err))
})

// @TODO filtering tests
// do we return the aggregates we have access to only?
// do we return everything if we're a superuser (validator)
tape('/channel/{id}/events-aggregates', async function(t) {
	const resp = await fetch(`${leaderUrl}/channel/${dummyVals.channel.id}/events-aggregates`, {
		method: 'GET',
		headers: {
			authorization: `Bearer ${dummyVals.auth.publisher}`,
			'content-type': 'application/json'
		}
	}).then(res => res.json())

	t.ok(resp.channel, 'has resp.channel')
	t.ok(resp.events, 'has resp.events')
	t.ok(resp.events.length >= 1, 'should have events of min legnth 1')
	t.ok(resp.events[0].events.IMPRESSION, 'has a single aggregate with IMPRESSIONS')
	t.end()
})

tape('health works correctly', async function(t) {
	const toFollower = 8
	const toLeader = 1
	const diff = toFollower - toLeader
	const approveStateUrl = `${followerUrl}/channel/${dummyVals.channel.id}/validator-messages/${
		dummyVals.ids.follower
	}/ApproveState?limit=1`
	await Promise.all(
		[leaderUrl, followerUrl].map(url =>
			postEvents(
				url,
				dummyVals.channel.id,
				genImpressions(url === followerUrl ? toFollower : toLeader)
			)
		)
	)

	// postEvents(followerUrl, dummyVals.channel.id, genImpressions(4))
	// wait for the events to be aggregated and new states to be issued
	await aggrAndTick()
	await forceTick()

	const resp = await fetch(approveStateUrl).then(res => res.json())
	const lastApprove = resp.validatorMessages[0]
	// @TODO: Should we assert balances numbers?
	// @TODO assert number of messages; this will be easy once we create a separate channel for each test
	t.equal(lastApprove.msg.isHealthy, false, 'channel is registered as unhealthy')

	// send events to the leader so it catches up
	await postEvents(leaderUrl, dummyVals.channel.id, genImpressions(diff))
	// one tick will generate NewState, the other ApproveState
	await aggrAndTick()
	await forceTick()

	// check if healthy
	const { validatorMessages } = await fetch(approveStateUrl).then(res => res.json())
	const lastApproveHealthy = validatorMessages[0]
	t.equal(lastApproveHealthy.msg.isHealthy, true, 'channel is registered as healthy')
	t.end()
})

tape('heartbeat has been emitted', async function(t) {
	await forceTick()
	await Promise.all(
		[
			`${followerUrl}/channel/${dummyVals.channel.id}/validator-messages/${
				dummyVals.ids.follower
			}/Heartbeat?limit=1`,
			`${followerUrl}/channel/${dummyVals.channel.id}/validator-messages/${
				dummyVals.ids.leader
			}/Heartbeat?limit=1`,
			`${leaderUrl}/channel/${dummyVals.channel.id}/validator-messages/${
				dummyVals.ids.leader
			}/Heartbeat?limit=1`,
			`${leaderUrl}/channel/${dummyVals.channel.id}/validator-messages/${
				dummyVals.ids.follower
			}/Heartbeat?limit=1`
		].map(url => {
			return fetch(url)
				.then(res => res.json())
				.then(function({ validatorMessages }) {
					const hb = validatorMessages.find(x => x.msg.type === 'Heartbeat')
					if (!hb) throw new Error(`should propagate heartbeat notification for ${url}`)
					t.ok(hb.msg.signature, 'heartbeat has signature')
					t.ok(hb.msg.timestamp, 'heartbeat has timestamp')
					t.ok(hb.msg.stateRoot, 'heartbeat has stateRoot')
					// @TODO should we test the validity of the signature?
				})
		})
	)

	t.end()
})

tape('POST /channel/{id}/{validator-messages}: wrong signature', function(t) {
	let stateRoot = ''
	let signature = ''

	fetch(
		`${followerUrl}/channel/${dummyVals.channel.id}/validator-messages/${
			dummyVals.ids.leader
		}/NewState?limit=1`
	)
		.then(res => res.json())
		.then(function({ validatorMessages }) {
			// NOTE: we need to generate a new balances tree here, so that we can
			// force a new NewState
			// otherwise, we'd just create a NewState with the same hash as the previous one
			const { balances } = validatorMessages[0].msg
			balances.someoneElse = '1'
			stateRoot = getStateRootHash(dummyAdapter, dummyVals.channel, balances)
			signature = getDummySig(stateRoot, 'awesomeLeader12')

			return fetch(`${followerUrl}/channel/${dummyVals.channel.id}/validator-messages`, {
				method: 'POST',
				headers: {
					authorization: `Bearer ${dummyVals.auth.leader}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					messages: [
						{
							type: 'NewState',
							stateRoot,
							balances,
							lastEvAggr: '2019-01-23T09:09:29.959Z',
							// sign by awesomeLeader12 rather than awesomeLeader
							signature
						}
					]
				})
			}).then(r => t.equal(r.status, 200, 'response status is right'))
		})
		.then(() => aggrAndTick())
		.then(function() {
			return fetch(
				`${followerUrl}/channel/${dummyVals.channel.id}/validator-messages/${
					dummyVals.ids.follower
				}/ApproveState`
			).then(res => res.json())
		})
		.then(function(resp) {
			const lastApprove = resp.validatorMessages.find(x => x.msg.stateRoot === stateRoot)
			t.equal(lastApprove, undefined, 'follower should not sign state with invalid signature')
		})
		.then(function() {
			return fetch(
				`${followerUrl}/channel/${dummyVals.channel.id}/validator-messages/${
					dummyVals.ids.follower
				}/RejectState`
			).then(res => res.json())
		})
		.then(function(resp) {
			const message = filterRejectStateMsg(resp.validatorMessages, {
				reason: 'InvalidSignature',
				stateRoot
			})[0]

			if (!message) throw new Error('should have an invalid new state')
			t.equal(message.msg.type, 'RejectState', 'should have an invalid new state')
			t.equal(message.msg.reason, 'InvalidSignature', 'reason should be invalid root hash')
			t.equal(message.msg.stateRoot, stateRoot, 'should have state root')
			t.equal(message.msg.signature, signature, 'should have the invalid signature')

			t.end()
		})
		.catch(err => t.fail(err))
})

tape('POST /channel/{id}/{validator-messages}: wrong (deceptive) root hash', function(t) {
	let deceptiveRootHash = ''

	fetch(
		`${followerUrl}/channel/${dummyVals.channel.id}/validator-messages/${
			dummyVals.ids.leader
		}/NewState?limit=1`
	)
		.then(res => res.json())
		.then(function(res) {
			const { balances } = res.validatorMessages[0].msg
			const fakeBalances = { publisher: '33333' }

			deceptiveRootHash = getStateRootHash(dummyAdapter, dummyVals.channel, fakeBalances)

			return fetch(`${followerUrl}/channel/${dummyVals.channel.id}/validator-messages`, {
				method: 'POST',
				headers: {
					authorization: `Bearer ${dummyVals.auth.leader}`,
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					messages: [
						{
							type: 'NewState',
							stateRoot: deceptiveRootHash,
							balances,
							lastEvAggr: '2019-01-23T09:10:29.959Z',
							signature: `Dummy adapter for ${deceptiveRootHash} by awesomeLeader`
						}
					]
				})
			}).then(r => t.equal(r.status, 200, 'response status is right'))
		})
		.then(() => aggrAndTick())
		// we tick again to test if we'd produce another RejectState
		// @TODO move into a separate test
		// @TODO similar test for ApproveState
		.then(() => forceTick())
		.then(function() {
			return fetch(
				`${followerUrl}/channel/${dummyVals.channel.id}/validator-messages/${
					dummyVals.ids.follower
				}/ApproveState`
			).then(res => res.json())
		})
		.then(function(resp) {
			const lastApprove = resp.validatorMessages.find(x => x.msg.stateRoot === deceptiveRootHash)
			t.equal(lastApprove, undefined, 'follower should not sign state with wrong root hash')
		})
		.then(function() {
			return fetch(
				`${followerUrl}/channel/${dummyVals.channel.id}/validator-messages/${
					dummyVals.ids.follower
				}/RejectState`
			).then(res => res.json())
		})
		.then(function(resp) {
			const allMsgs = filterRejectStateMsg(resp.validatorMessages, {
				reason: 'InvalidRootHash',
				stateRoot: deceptiveRootHash
			})
			t.equal(allMsgs.length, 1, 'RejectState is produced only once')
			const message = allMsgs[0]

			t.ok(message, 'should have an invalid new state')
			t.equal(message.msg.type, 'RejectState', 'should have an invalid new state')
			t.equal(message.msg.reason, 'InvalidRootHash', 'reason should be invalid root hash')
			t.equal(message.msg.stateRoot, deceptiveRootHash, 'should have the deceptive root hash')

			t.end()
		})
		.catch(err => t.fail(err))
})

tape('cannot exceed channel deposit', function(t) {
	fetch(`${leaderUrl}/channel/${dummyVals.channel.id}/status`)
		.then(res => res.json())
		.then(function(resp) {
			// 1 event pays 1 token for now
			// @TODO make this work with a more complex model
			const evCount = resp.channel.depositAmount + 1

			return Promise.all(
				[leaderUrl, followerUrl].map(url =>
					postEvents(url, dummyVals.channel.id, genImpressions(evCount))
				)
			)
		})
		.then(() => aggrAndTick())
		.then(function() {
			return fetch(
				`${leaderUrl}/channel/${dummyVals.channel.id}/validator-messages/awesomeLeader/Accounting`
			)
				.then(res => res.json())
				.then(({ validatorMessages }) => validatorMessages[0].msg)
		})
		.then(function(resp) {
			const sum = Object.keys(resp.balances)
				.map(k => parseInt(resp.balances[k], 10))
				.reduce((a, b) => a + b, 0)

			t.ok(sum === expectedDepositAmnt, 'balance does not exceed the deposit')
			// @TODO state changed to exhausted, unable to take any more events
			t.end()
		})
		.catch(err => t.fail(err))
})

// @TODO fees are adequately applied to NewState
// @TODO sentry tests: ensure every middleware case is accounted for: channelIfExists, channelIfActive, auth
// @TODO consider separate tests for when/if/how /tree is updated? or unit tests for the event aggregator
// @TODO tests for the adapters and especially ewt
// @TODO we can recover from the validator worker crashing
