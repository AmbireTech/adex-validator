#!/usr/bin/env node
const tape = require('tape')
const fetch = require('node-fetch')
const { Channel, MerkleTree } = require('adex-protocol-eth/js')
const { getStateRootHash, toBNStringMap } = require('../services/validatorWorker/lib')
const { getBalancesAfterFeesTree } = require('../services/validatorWorker/lib/fees')
const dummyAdapter = require('../adapters/dummy')
const {
	forceTick,
	wait,
	postEvents,
	genImpressions,
	getDummySig,
	filterInvalidNewStateMsg,
	incrementKeys
} = require('./lib')
const cfg = require('../cfg')
const dummyVals = require('./prep-db/mongo')

const leaderUrl = dummyVals.channel.spec.validators[0].url
const followerUrl = dummyVals.channel.spec.validators[1].url
const defaultPubName = dummyVals.ids.publisher
const expectedDepositAmnt = dummyVals.channel.depositAmount

function aggrAndTick() {
	// If we need to run the production config with AGGR_THROTTLE, then we need to wait for cfg.AGGR_THROTTLE + 500
	if (process.env.NODE_ENV == 'production') {
		return wait(cfg.AGGR_THROTTLE + cfg.WAIT_TIME).then(forceTick)
	} else {
		return forceTick()
	}
}

tape('submit events and ensure they are accounted for', function(t) {
	const evs = genImpressions(3).concat(genImpressions(2, 'anotherPublisher'))
	const expectedBal = '3'

	let channel
	let tree
	let balancesAfterFeesTree

	Promise.all(
		// @TODO maybe we should assert that the status is 200 here?
		[leaderUrl, followerUrl].map(url => postEvents(url, dummyVals.channel.id, evs))
	)
		.then(() => aggrAndTick())
		.then(function() {
			return fetch(`${leaderUrl}/channel/${dummyVals.channel.id}/tree`).then(res => res.json())
		})
		.then(function(resp) {
			t.ok(resp && resp.balances, 'there is a balances tree')
			channel = resp.channel
			tree = resp.balances
			balancesAfterFeesTree = resp.balancesAfterFees
			t.equal(tree[defaultPubName], expectedBal, 'balances is right')
			// We will check the leader, cause this means this happened:
			// the NewState was generated, sent to the follower,
			// who generated ApproveState and sent back to the leader
			// first wait though, as we need the follower to discover they have an event to approve
			return aggrAndTick()
				.then(function() {
					return fetch(
						`${leaderUrl}/channel/${dummyVals.channel.id}/validator-messages/${
							dummyVals.ids.leader
						}/NewState?limit=1`
					).then(res => res.json())
				})
				.then(function(resp) {
					return fetch(
						`${leaderUrl}/channel/${dummyVals.channel.id}/validator-messages/${
							dummyVals.ids.follower
						}/ApproveState?limit=1`
					)
						.then(res => res.json())
						.then(res => {
							resp.validatorMessages = resp.validatorMessages.concat(res.validatorMessages)
							return resp
						})
				})
		})
		.then(function(resp) {
			const msgs = resp.validatorMessages
			t.ok(Array.isArray(msgs), 'has validatorMessages')
			// ensure NewState is in order
			const lastNew = msgs.find(x => x.msg.type === 'NewState')

			t.ok(lastNew, 'has NewState')
			t.equal(lastNew.from, channel.validators[0], 'NewState: is by the leader')
			t.equal(lastNew.msg.balances[defaultPubName], expectedBal, 'NewState: balances is right')
			t.ok(
				typeof lastNew.msg.stateRoot === 'string' && lastNew.msg.stateRoot.length === 64,
				'NewState: stateRoot is sane'
			)
			t.equal(
				lastNew.msg.signature,
				getDummySig(lastNew.msg.stateRoot, lastNew.from),
				'NewState: signature is sane'
			)
			t.deepEqual(lastNew.msg.balances, tree, 'NewState: balances is the same as the one in /tree')
			t.deepEqual(
				lastNew.msg.balancesAfterFees,
				balancesAfterFeesTree,
				'NewState: balancesAfterFeesTree is the same as the one in /tree'
			)

			// Ensure ApproveState is in order
			const lastApprove = msgs.find(x => x.msg.type === 'ApproveState')
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
			t.equal(lastApprove.msg.isHealthy, true, 'ApproveState: health value is HEALTHY')

			// Check inclusion proofs of the balance
			// stateRoot = keccak256(channelId, balanceRoot)
			const allLeafs = Object.keys(balancesAfterFeesTree).map(k =>
				Channel.getBalanceLeaf(k, balancesAfterFeesTree[k])
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

tape('/channel/{id}/events-aggregates', function(t) {
	fetch(`${leaderUrl}/channel/${dummyVals.channel.id}/events-aggregates`, {
		method: 'GET',
		headers: {
			authorization: `Bearer ${dummyVals.auth.publisher}`,
			'content-type': 'application/json'
		}
	})
		.then(res => {
			return res.json()
		})
		.then(function(resp) {
			t.ok(resp.channel, 'has resp.channel')
			t.ok(resp.events, 'has resp.events')
			t.ok(resp.events.length >= 1, 'should have events of min legnth 1')
			t.ok(resp.events[0].events.IMPRESSION, 'has a single aggregate with IMPRESSIONS')
			t.end()
		})
		.catch(err => t.fail(err))
})

tape('health works correctly', function(t) {
	const toFollower = 8
	const toLeader = 1
	const diff = toFollower - toLeader
	Promise.all(
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
		.then(() => aggrAndTick())
		.then(() => forceTick())
		.then(function() {
			// get the latest state
			return fetch(`${followerUrl}/channel/${dummyVals.channel.id}/validator-messages`).then(res =>
				res.json()
			)
		})
		.then(function(resp) {
			const lastApprove = resp.validatorMessages.find(x => x.msg.type === 'ApproveState')
			// @TODO: Should we assert balances numbers?
			t.equal(lastApprove.msg.isHealthy, false, 'channel is registered as unhealthy')

			// send events to the leader so it catches up
			return postEvents(leaderUrl, dummyVals.channel.id, genImpressions(diff))
		})
		// one tick will generate NewState, the other ApproveState
		.then(() => aggrAndTick())
		.then(() => forceTick())
		.then(function() {
			return fetch(`${followerUrl}/channel/${dummyVals.channel.id}/validator-messages`).then(res =>
				res.json()
			)
		})
		.then(function(resp) {
			const lastApprove = resp.validatorMessages.find(x => x.msg.type === 'ApproveState')
			t.equal(lastApprove.msg.isHealthy, true, 'channel is registered as healthy')
			t.end()
		})
		.catch(err => t.fail(err))
})

tape('heartbeat works correctly', function(t) {
	Promise.resolve()
		.then(() => aggrAndTick())
		.then(function() {
			;[
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
			].forEach(url => {
				fetch(url)
					.then(res => res.json())
					.then(function(resp) {
						const health = resp.validatorMessages.find(x => x.msg.type === 'Heartbeat')
						t.ok(health, 'should propagate heartbeat notification')
						t.ok(health.msg.signature, 'heartbeat notification has signature')
						t.ok(health.msg.timestamp, 'heartbeat notification has timestamp')
						t.ok(health.msg.stateRoot, 'heartbeat notification has stateRoot')
					})
			})

			return fetch(
				`${followerUrl}/channel/${dummyVals.channel.id}/validator-messages/${
					dummyVals.ids.follower
				}/Heartbeat?limit=1`
			).then(res => res.json())
		})
		.then(() => t.end())
		.catch(err => t.fail(err))
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
		.then(function(res) {
			const { balances } = res.validatorMessages[0].msg
			const incBalances = incrementKeys(balances)

			const balancesAfterFees = getBalancesAfterFeesTree(incBalances, dummyVals.channel)
			stateRoot = getStateRootHash(dummyAdapter, { id: dummyVals.channel.id }, balancesAfterFees)
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
							balances: incBalances,
							balancesAfterFees: toBNStringMap(balancesAfterFees),
							lastEvAggr: '2019-01-23T09:09:29.959Z',
							// sign by awesomeLeader1 rather than awesomeLeader
							signature,
							created: Date.now()
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
				}/InvalidNewState`
			).then(res => res.json())
		})
		.then(function(resp) {
			const message = filterInvalidNewStateMsg(resp.validatorMessages, {
				reason: 'InvalidSignature',
				stateRoot
			})[0]

			t.ok(message, 'should have an invalid new state')
			t.equal(message.msg.type, 'InvalidNewState', 'should have an invalid new state')
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
			const { balances, balancesAfterFees } = res.validatorMessages[0].msg
			const fakeBalances = { publisher: '3' }

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
							balancesAfterFees,
							lastEvAggr: '2019-01-23T09:10:29.959Z',
							signature: `Dummy adapter for ${deceptiveRootHash} by awesomeLeader`,
							created: Date.now()
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
			const lastApprove = resp.validatorMessages.find(x => x.msg.stateRoot === deceptiveRootHash)
			t.equal(lastApprove, undefined, 'follower should not sign state with wrong root hash')
		})
		.then(function() {
			return fetch(
				`${followerUrl}/channel/${dummyVals.channel.id}/validator-messages/${
					dummyVals.ids.follower
				}/InvalidNewState`
			).then(res => res.json())
		})
		.then(function(resp) {
			const message = filterInvalidNewStateMsg(resp.validatorMessages, {
				reason: 'InvalidRootHash',
				stateRoot: deceptiveRootHash
			})[0]

			t.ok(message, 'should have an invalid new state')
			t.equal(message.msg.type, 'InvalidNewState', 'should have an invalid new state')
			t.equal(message.msg.reason, 'InvalidRootHash', 'reason should be invalid root hash')
			t.equal(message.msg.stateRoot, deceptiveRootHash, 'should have the deceptive root hash')

			t.end()
		})
		.catch(err => t.fail(err))
})

tape('POST /channel/{id}/{validator-messages}: wrong (deceptive) balanceAfterFees', function(t) {
	let stateRoot

	fetch(
		`${followerUrl}/channel/${dummyVals.channel.id}/validator-messages/${
			dummyVals.ids.leader
		}/NewState?limit=1`
	)
		.then(res => res.json())
		.then(function(res) {
			const { balances, balancesAfterFees } = res.validatorMessages[0].msg

			stateRoot = getStateRootHash(dummyAdapter, dummyVals.channel, balancesAfterFees)

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
							balancesAfterFees: incrementKeys(balancesAfterFees),
							lastEvAggr: '2019-01-23T09:10:29.959Z',
							signature: `Dummy adapter for ${stateRoot} by awesomeLeader`
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
			t.equal(lastApprove, undefined, 'follower should not sign state with wrong root hash')
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
			return fetch(`${leaderUrl}/channel/${dummyVals.channel.id}/tree`).then(res => res.json())
		})
		.then(function(resp) {
			const sum = Object.keys(resp.balances)
				.map(k => parseInt(resp.balances[k]))
				.reduce((a, b) => a + b, 0)

			t.ok(sum === expectedDepositAmnt, 'balance does not exceed the deposit')
			// @TODO state changed to exhausted, unable to take any more events
			t.end()
		})
		.catch(err => t.fail(err))
})

// @TODO sentry tests: ensure every middleware case is accounted for: channelIfExists, channelIfActive, auth
// @TODO consider separate tests for when/if/how /tree is updated? or unit tests for the event aggregator
// @TODO tests for the adapters and especially ewt
// @TODO we can recover from the validator worker crashing
