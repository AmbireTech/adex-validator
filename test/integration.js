#!/usr/bin/env node
const tape = require('tape-catch')
const fetch = require('node-fetch')
const { Channel, MerkleTree } = require('adex-protocol-eth/js')
const { getStateRootHash } = require('../services/validatorWorker/lib')
const SentryInterface = require('../services/validatorWorker/lib/sentryInterface')
const { forceTick, wait, postEvents, genEvents, getDummySig, fetchPost } = require('./lib')
const cfg = require('../cfg')
const dummyVals = require('./prep-db/mongo')

const leaderUrl = dummyVals.channel.spec.validators[0].url
const followerUrl = dummyVals.channel.spec.validators[1].url
const defaultPubName = dummyVals.ids.publisher

let dummyAdapter = require('../adapters/dummy')

dummyAdapter = new dummyAdapter.Adapter({ dummyIdentity: dummyVals.ids.leader }, cfg)
dummyAdapter.init()
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
	const evs = genEvents(3).concat(genEvents(2, 'anotherPublisher'))
	const expectedBal = '3'
	const expectedBalAfterFees = '2'

	const channel = dummyVals.channel
	await Promise.all(
		[leaderUrl, followerUrl].map(url =>
			postEvents(url, dummyVals.channel.id, evs).then(({ status }) => {
				if (status !== 200) throw new Error(`postEvents failed with ${status}`)
			})
		)
	)
	await aggrAndTick()
	const resp = await iface.getOurLatestMsg('Accounting')

	t.ok(resp && resp.balances, 'there is a balances tree')
	const balancesTreePreFees = resp.balancesBeforeFees
	const balancesTree = resp.balances
	t.equal(balancesTreePreFees[defaultPubName], expectedBal, 'balances is right')
	// We will check the leader, cause this means this happened:
	// the NewState was generated, sent to the follower,
	// who generated ApproveState and sent back to the leader
	await aggrAndTick()

	const lastApproved = await iface.getLastApproved()

	t.ok(lastApproved, 'has lastApproved')
	// ensure NewState is in order
	const lastNew = lastApproved.newState
	t.ok(lastNew, 'has NewState')
	t.equal(lastNew.from, dummyVals.ids.leader, 'NewState: is by the leader')
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
	t.equal(lastApprove.from, dummyVals.ids.follower, 'ApproveState: is by the follower')
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
	const stateRootRaw = Channel.getSignableStateRoot(channel.id, mTree.getRoot()).toString('hex')
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

tape('should prevent submitting events for expired channel', async function(t) {
	const channel = {
		...dummyVals.channel,
		id: 'expiredChannelTest',
		validUntil: Math.ceil(Date.now() / 1000) + 1,
		spec: {
			...dummyVals.channel.spec,
			withdrawPeriodStart: Date.now() + 500
		}
	}

	// Submit a new channel; we submit it to both sentries to avoid 404 when propagating messages
	await Promise.all([
		fetchPost(`${leaderUrl}/channel`, dummyVals.auth.leader, channel),
		fetchPost(`${followerUrl}/channel`, dummyVals.auth.follower, channel)
	])

	// wait till channel expires
	await wait(2100)

	const resp = await postEvents(followerUrl, channel.id, genEvents(1)).then(r => r.json())
	t.equal(resp.message, 'channel is expired', 'should prevent events after validUntil')
	t.end()
})

tape('should prevent submitting events for a channel in withdraw period', async function(t) {
	const channel = {
		...dummyVals.channel,
		id: 'withdrawPeriodTest',
		validUntil: Math.floor(Date.now() / 1000) + 20,
		spec: {
			...dummyVals.channel.spec,
			withdrawPeriodStart: Date.now() + 1000
		}
	}

	// Submit a new channel; we submit it to both sentries to avoid 404 when propagating messages
	await Promise.all([
		fetchPost(`${leaderUrl}/channel`, dummyVals.auth.leader, channel),
		fetchPost(`${followerUrl}/channel`, dummyVals.auth.follower, channel)
	])

	// wait till withdrawPeriodStart
	await wait(1100)

	const resp = await postEvents(followerUrl, channel.id, genEvents(1)).then(r => r.json())
	t.equal(
		resp.message,
		'channel is past withdraw period',
		'should prevent events after withdraw period'
	)
	// @TODO we can still submit validator messages

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

tape('/channel/{id}/events-aggregates', async function(t) {
	const id = 'eventAggregateCountTest'
	const channel = { ...dummyVals.channel, id }

	// Submit a new channel; we submit it to both sentries to avoid 404 when propagating messages
	await Promise.all([
		fetchPost(`${leaderUrl}/channel`, dummyVals.auth.leader, channel),
		fetchPost(`${followerUrl}/channel`, dummyVals.auth.follower, channel)
	])

	// post events for that channel for multiple publishers
	const publishers = [
		[dummyVals.auth.publisher, genEvents(1, dummyVals.ids.publisher)],
		[dummyVals.auth.publisher2, genEvents(1, dummyVals.ids.publisher2)]
	]

	await Promise.all(
		publishers.map(async ([auth, event]) =>
			postEvents(leaderUrl, id, event, auth).then(res => res.json())
		)
	)
	await aggrAndTick()

	const eventAggrFilterfixtures = [
		// if we're a non superuser (validator) returns our event
		[dummyVals.auth.publisher, 1],
		[dummyVals.auth.publisher2, 1],
		// if we're a superuser (validator) returns all events
		[dummyVals.auth.leader, 2]
	]
	const url = `${leaderUrl}/channel/${id}/events-aggregates`

	await Promise.all(
		eventAggrFilterfixtures.map(async fixture => {
			const [auth, eventLength] = fixture
			const resp = await fetch(url, {
				method: 'GET',
				headers: {
					authorization: `Bearer ${auth}`,
					'content-type': 'application/json'
				}
			}).then(res => res.json())
			t.ok(resp.channel, 'has resp.channel')
			t.ok(resp.events, 'has resp.events')
			t.ok(resp.events.length === eventLength, `should have events of length ${eventLength}`)
			t.ok(resp.events[0].events.IMPRESSION, 'has a single aggregate with IMPRESSIONS')
		})
	)

	t.end()
})

tape('health works correctly', async function(t) {
	const toFollower = 10
	const toLeader = 1
	const diff = toFollower - toLeader

	await Promise.all(
		[leaderUrl, followerUrl].map(url =>
			postEvents(url, dummyVals.channel.id, genEvents(url === followerUrl ? toFollower : toLeader))
		)
	)

	// wait for the events to be aggregated and new states to be issued
	await aggrAndTick()
	await forceTick()

	const lastApprove = await iface.getLatestMsg(dummyVals.ids.follower, 'ApproveState')
	// @TODO: Should we assert balances numbers?
	// @TODO assert number of messages; this will be easy once we create a separate channel for each test
	t.equal(lastApprove.isHealthy, false, 'channel is registered as unhealthy')

	// send events to the leader so it catches up
	await postEvents(leaderUrl, dummyVals.channel.id, genEvents(diff))
	await aggrAndTick()
	await forceTick()

	// check if healthy
	const lastApproveHealthy = await iface.getLatestMsg(dummyVals.ids.follower, 'ApproveState')
	t.equal(lastApproveHealthy.isHealthy, true, 'channel is registered as healthy')
	t.end()
})

tape('heartbeat has been emitted', async function(t) {
	// This also checks if the propagation works, cause it tries to get the followers
	// message through the leader Sentry
	await forceTick()
	const results = await Promise.all([
		iface.getLatestMsg(dummyVals.ids.leader, 'Heartbeat'),
		iface.getLatestMsg(dummyVals.ids.follower, 'Heartbeat')
	])
	results.forEach((hb, idx) => {
		if (!hb) throw new Error(`should propagate heartbeat notification for ${idx}`)
		t.ok(hb.signature, 'heartbeat has signature')
		t.ok(hb.timestamp, 'heartbeat has timestamp')
		t.ok(hb.stateRoot, 'heartbeat has stateRoot')
		// @TODO should we test the validity of the signature?
	})

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
		const stateRoot = getStateRootHash(dummyAdapter, dummyVals.channel, balances).toString('hex')
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
		const deceptiveStateRoot = getStateRootHash(
			dummyAdapter,
			dummyVals.channel,
			fakeBalances
		).toString('hex')
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
		const stateRoot = getStateRootHash(dummyAdapter, dummyVals.channel, balances).toString('hex')
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
			[defaultPubName]: (parseInt(dummyVals.channel.depositAmount, 10) + 1).toString()
		}
		const stateRoot = getStateRootHash(dummyAdapter, dummyVals.channel, balances).toString('hex')
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
	const channel = { ...dummyVals.channel, id: 'exceedDepositTest' }

	const channelIface = new SentryInterface(dummyAdapter, channel, { logging: false })

	// Submit a new channel; we submit it to both sentries to avoid 404 when propagating messages
	await Promise.all([
		fetchPost(`${leaderUrl}/channel`, dummyVals.auth.leader, channel),
		fetchPost(`${followerUrl}/channel`, dummyVals.auth.follower, channel)
	])

	// 1 event pays 1 token for now; we can change that via spec.minPerImpression
	const expectDeposit = parseInt(channel.depositAmount, 10)
	const evCount = expectDeposit + 1
	await postEvents(leaderUrl, channel.id, genEvents(evCount))
	await aggrAndTick()

	const { balances } = await channelIface.getOurLatestMsg('Accounting')
	const sum = Object.keys(balances)
		.map(k => parseInt(balances[k], 10))
		.reduce((a, b) => a + b, 0)
	t.equal(sum, expectDeposit, 'balance does not exceed the deposit, but equals it')
	t.end()
})

tape('should close channel', async function(t) {
	const channel = { ...dummyVals.channel, id: 'closeTest' }
	const channelIface = new SentryInterface(dummyAdapter, channel, { logging: false })

	// Submit a new channel; we submit it to both sentries to avoid 404 when propagating messages
	await Promise.all([
		fetchPost(`${leaderUrl}/channel`, dummyVals.auth.leader, channel),
		fetchPost(`${followerUrl}/channel`, dummyVals.auth.follower, channel)
	])

	// 1 event pays 1 token for now; we can change that via spec.minPerImpression
	const expectDeposit = parseInt(channel.depositAmount, 10)
	await postEvents(leaderUrl, channel.id, genEvents(10))

	// close channel event
	await fetchPost(`${leaderUrl}/channel/${channel.id}/events`, dummyVals.auth.creator, {
		events: genEvents(1, null, 'CLOSE')
	})

	await aggrAndTick()

	// check the creator is awarded the remaining token balance
	const { balances } = await channelIface.getOurLatestMsg('Accounting')
	t.equal(
		balances[dummyVals.auth.creator],
		'792',
		'creator balance should be remaining channel deposit minus fees'
	)
	const sum = Object.keys(balances)
		.map(k => parseInt(balances[k], 10))
		.reduce((a, b) => a + b, 0)
	t.equal(sum, expectDeposit, 'balance does not exceed the deposit, but equals it')
	t.end()
})

// @TODO fees are adequately applied to NewState
// @TODO sentry tests: ensure every middleware case is accounted for: channelIfExists, channelIfActive, auth
// @TODO tests for the adapters and especially ewt
