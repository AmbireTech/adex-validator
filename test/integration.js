#!/usr/bin/env node
const tape = require('tape-catch')
const fetch = require('node-fetch')
const { Channel, MerkleTree } = require('adex-protocol-eth/js')
const { getStateRootHash } = require('../services/validatorWorker/lib')
const SentryInterface = require('../services/validatorWorker/lib/sentryInterface')
const dummyAdapter = require('../adapters/dummy')
const { forceTick, wait, postEvents, genImpressions, getDummySig } = require('./lib')
const cfg = require('../cfg')
const dummyVals = require('./prep-db/mongo')

const leaderUrl = dummyVals.channel.spec.validators[0].url
const followerUrl = dummyVals.channel.spec.validators[1].url
const defaultPubName = dummyVals.ids.publisher
const expectedDepositAmnt = dummyVals.channel.depositAmount

dummyAdapter.init({ dummyIdentity: dummyVals.ids.leader })
const iface = new SentryInterface(dummyAdapter, dummyVals.channel, { logging: false })

function aggrAndTick() {
	// If we need to run the production config with AGGR_THROTTLE, then we need to wait for cfg.AGGR_THROTTLE + 500
	// the reason is that in production we have a throttle for saving event aggregates
	if (process.env.NODE_ENV === 'production') {
		return wait(cfg.AGGR_THROTTLE + cfg.WAIT_TIME).then(forceTick)
	}
	return forceTick()
}

tape('submit events and ensure they are accounted for', async function(t) {
	const evs = genImpressions(3).concat(genImpressions(2, 'anotherPublisher'))
	const expectedBal = '3'
	const expectedBalAfterFees = '2'

	const channel = dummyVals.channel
	await Promise.all(
		// @TODO maybe we should assert that the status is 200 here?
		[leaderUrl, followerUrl].map(url => postEvents(url, dummyVals.channel.id, evs))
	)
	await aggrAndTick()
	const resp = await fetch(
		`${leaderUrl}/channel/${dummyVals.channel.id}/validator-messages/awesomeLeader/Accounting`
	)
		.then(res => res.json())
		.then(({ validatorMessages }) => validatorMessages[0].msg)

	t.ok(resp && resp.balances, 'there is a balances tree')
	const balancesTreePreFees = resp.balancesBeforeFees
	const balancesTree = resp.balances
	t.equal(balancesTreePreFees[defaultPubName], expectedBal, 'balances is right')
	// We will check the leader, cause this means this happened:
	// the NewState was generated, sent to the follower,
	// who generated ApproveState and sent back to the leader
	await aggrAndTick()

	const { lastApproved } = await fetch(
		`${leaderUrl}/channel/${dummyVals.channel.id}/last-approved`
	).then(res => res.json())

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
	const allLeafs = Object.keys(balancesTree).map(k => Channel.getBalanceLeaf(k, balancesTree[k]))
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

tape('new states are not produced when there are no new aggregates', async function(t) {
	const url = `${leaderUrl}/channel/${dummyVals.channel.id}/validator-messages`
	const { validatorMessages } = await fetch(url).then(res => res.json())
	t.ok(Array.isArray(validatorMessages), 'has validatorMessages')
	// Force it two times, which should technically produce two new aggregates,
	// 50ms apart (by their created timestamp)
	await forceTick()
	await wait(50)
	await forceTick()
	const newResp = await fetch(url).then(res => res.json())
	t.deepEqual(validatorMessages, newResp.validatorMessages, 'validatorMessages should be the same')
	t.end()
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

async function testRejectState(t, expectedReason, makeNewState) {
	const lastApproved = await iface.getLastApproved('NewState')
	const maliciousNewState = makeNewState(lastApproved.newState.msg)
	await iface.propagate([maliciousNewState])
	await forceTick()
	const [approve, reject] = await Promise.all([
		iface.getLatestMsg(dummyVals.ids.follower, 'ApproveState'),
		iface.getLatestMsg(dummyVals.ids.follower, 'RejectState')
	])
	if (approve)
		t.notEqual(
			approve.stateRoot,
			maliciousNewState.stateRoot,
			'we have not approved the malicious NewState'
		)

	t.ok(reject, 'has a RejectState')
	if (reject) {
		t.equal(
			reject.stateRoot,
			maliciousNewState.stateRoot,
			'we have rejected the malicious NewState'
		)
		t.equal(reject.reason, expectedReason, `reason for rejection is ${expectedReason}`)
	}
}

tape('RejectState: wrong signature (InvalidSignature)', async function(t) {
	await testRejectState(t, 'InvalidSignature', function(newState) {
		// increase the balance, so we effectively end up with a new state
		const balances = { ...newState.balances, someoneElse: '1' }
		const stateRoot = getStateRootHash(dummyAdapter, dummyVals.channel, balances)
		return {
			...newState,
			balances,
			stateRoot,
			signature: getDummySig(stateRoot, 'awesomeLeader12')
		}
	})
	t.end()
})

tape('RejectState: deceptive stateRoot (InvalidRootHash)', async function(t) {
	await testRejectState(t, 'InvalidRootHash', function(newState) {
		// This attack is: we give the follower a valid `balances`,
		// but a `stateRoot` that represents a totally different tree; with a valid signature
		const fakeBalances = { publisher: '33333' }
		const deceptiveStateRoot = getStateRootHash(dummyAdapter, dummyVals.channel, fakeBalances)
		return {
			...newState,
			stateRoot: deceptiveStateRoot,
			signature: getDummySig(deceptiveStateRoot, dummyVals.ids.leader)
		}
	})
	t.end()
})

tape('RejectState: invalid OUTPACE transition', async function(t) {
	await testRejectState(t, 'InvalidTransition', function(newState) {
		// Send a fully valid message, but violating the OUTPACe rules by reducing someone's balance
		const balances = { ...newState.balances, [defaultPubName]: '0' }
		const stateRoot = getStateRootHash(dummyAdapter, dummyVals.channel, balances)
		return {
			...newState,
			balances,
			stateRoot,
			signature: getDummySig(stateRoot, dummyVals.ids.leader)
		}
	})
	t.end()
})

tape('RejectState: invalid OUTPACE transition: exceed deposit', async function(t) {
	await testRejectState(t, 'InvalidTransition', function(newState) {
		// Send a fully valid message, but violating the OUTPACe rules by reducing someone's balance
		const balances = {
			...newState.balances,
			[defaultPubName]: (dummyVals.channel.depositAmount+1).toString()
		}
		const stateRoot = getStateRootHash(dummyAdapter, dummyVals.channel, balances)
		return {
			...newState,
			balances,
			stateRoot,
			signature: getDummySig(stateRoot, dummyVals.ids.leader)
		}
	})
	t.end()
})


tape('cannot exceed channel deposit', async function(t) {
	const statusResp = await fetch(`${leaderUrl}/channel/${dummyVals.channel.id}/status`).then(res =>
		res.json()
	)

	// 1 event pays 1 token for now
	// @TODO make this work with a more complex model
	const evCount = statusResp.channel.depositAmount + 1

	await Promise.all(
		[leaderUrl, followerUrl].map(url =>
			postEvents(url, dummyVals.channel.id, genImpressions(evCount))
		)
	)
	await aggrAndTick()

	const { balances } = await fetch(
		`${leaderUrl}/channel/${dummyVals.channel.id}/validator-messages/awesomeLeader/Accounting`
	)
		.then(res => res.json())
		.then(({ validatorMessages }) => validatorMessages[0].msg)

	const sum = Object.keys(balances)
		.map(k => parseInt(balances[k], 10))
		.reduce((a, b) => a + b, 0)
	t.ok(sum === expectedDepositAmnt, 'balance does not exceed the deposit')
	// @TODO state changed to exhausted, unable to take any more events
	t.end()
})

// @TODO fees are adequately applied to NewState
// @TODO sentry tests: ensure every middleware case is accounted for: channelIfExists, channelIfActive, auth
// @TODO tests for the adapters and especially ewt
// @TODO we can recover from the validator worker crashing
