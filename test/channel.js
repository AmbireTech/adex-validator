#!/usr/bin/env node
const tape = require('tape-catch')
const SentryInterface = require('../services/validatorWorker/lib/sentryInterface')
const {
	forceTick,
	wait,
	postEvents,
	genEvents,
	fetchPost,
	withdrawPeriodStart,
	validUntil
} = require('./lib')
const cfg = require('../cfg')
const dummyVals = require('./prep-db/mongo')
const { eventTypes } = require('../services/constants')

const leaderUrl = dummyVals.channel.spec.validators[0].url
const followerUrl = dummyVals.channel.spec.validators[1].url

let dummyAdapter = require('../adapters/dummy')

dummyAdapter = new dummyAdapter.Adapter({ dummyIdentity: dummyVals.ids.leader }, cfg)
dummyAdapter.init()

function aggrAndTick() {
	// If we need to run the production config with AGGR_THROTTLE, then we need to wait for cfg.AGGR_THROTTLE + 500
	// the reason is that in production we have a throttle for saving event aggregates
	if (process.env.NODE_ENV === 'production') {
		return wait(cfg.AGGR_THROTTLE + cfg.WAIT_TIME).then(forceTick)
	}
	return forceTick()
}

tape('cannot exceed channel deposit', async function(t) {
	const channel = {
		...dummyVals.channel,
		id: 'exceedDepositTest',
		validUntil,
		spec: {
			...dummyVals.channel.spec,
			withdrawPeriodStart
		}
	}

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
	await forceTick()

	const { balances } = await channelIface.getOurLatestMsg('Accounting')
	const sum = Object.keys(balances)
		.map(k => parseInt(balances[k], 10))
		.reduce((a, b) => a + b, 0)
	t.equal(sum, expectDeposit, 'balance does not exceed the deposit, but equals it')
	t.end()
})

tape('should close channel', async function(t) {
	const channel = {
		...dummyVals.channel,
		id: 'closeTest',
		validUntil,
		spec: {
			...dummyVals.channel.spec,
			withdrawPeriodStart
		}
	}

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

tape('should prevent sending heartbeat on exhausted channels', async function(t) {
	const channel = {
		...dummyVals.channel,
		id: 'exhaustedChannelHeartbeat',
		validUntil,
		spec: {
			...dummyVals.channel.spec,
			withdrawPeriodStart
		}
	}

	const channelIface = new SentryInterface(dummyAdapter, channel, { logging: false })

	// Submit a new channel; we submit it to both sentries to avoid 404 when propagating messages
	await Promise.all([
		fetchPost(`${leaderUrl}/channel`, dummyVals.auth.leader, channel),
		fetchPost(`${followerUrl}/channel`, dummyVals.auth.follower, channel)
	])

	await postEvents(leaderUrl, channel.id, genEvents(1000))
	// should not generate heartbeat beacuse the channel is exhausted
	await aggrAndTick()
	await forceTick()

	const latestHeartbeatMsg = await channelIface.getOurLatestMsg('Heartbeat')

	t.equal(latestHeartbeatMsg, null, 'should not send heartbeat on exhausted channel')
	t.end()
})

tape('should update the price per impression for channel', async function(t) {
	const channel = {
		...dummyVals.channel,
		id: 'updatePrice',
		validUntil,
		spec: {
			...dummyVals.channel.spec,
			withdrawPeriodStart
		}
	}

	const channelIface = new SentryInterface(dummyAdapter, channel, { logging: false })

	// Submit a new channel; we submit it to both sentries to avoid 404 when propagating messages
	await Promise.all([
		fetchPost(`${leaderUrl}/channel`, dummyVals.auth.leader, channel),
		fetchPost(`${followerUrl}/channel`, dummyVals.auth.follower, channel)
	])

	// 1 event pays 1 token for now
	await postEvents(leaderUrl, channel.id, genEvents(10))
	// post update channel price event
	await fetchPost(`${leaderUrl}/channel/${channel.id}/events`, dummyVals.auth.creator, {
		events: [{ type: 'UPDATE_IMPRESSION_PRICE', price: '3' }]
	})

	await aggrAndTick()

	// 1 event pays 3 tokens now;
	await postEvents(leaderUrl, channel.id, genEvents(10))

	await aggrAndTick()

	const { balances } = await channelIface.getOurLatestMsg('Accounting')
	// the total eventpayout is 40 i.e. (3 * 10) + (1 * 10) = 32 + 4 + 4
	t.equal(
		balances[dummyVals.ids.publisher],
		'32',
		'publisher balance should be charged according to new price'
	)
	t.equal(balances[dummyVals.ids.leader], '4', 'should have correct leader validator fee')
	t.equal(balances[dummyVals.ids.follower], '4', 'should have correct follower validator fee')

	t.end()
})

tape('should payout using promilles of price per impression for channel', async function(t) {
	const channel = {
		...dummyVals.channel,
		id: 'impressionWithCommission',
		validUntil,
		spec: {
			...dummyVals.channel.spec,
			minPerImpression: '3',
			withdrawPeriodStart
		}
	}

	const channelIface = new SentryInterface(dummyAdapter, channel, { logging: false })
	// Submit a new channel; we submit it to both sentries to avoid 404 when propagating messages
	await Promise.all([
		fetchPost(`${leaderUrl}/channel`, dummyVals.auth.leader, channel),
		fetchPost(`${followerUrl}/channel`, dummyVals.auth.follower, channel)
	])

	const evs = genEvents(2, null, 'IMPRESSION_WITH_COMMISSION', null, null)

	// 1 event pays 3 tokens now;
	await postEvents(leaderUrl, channel.id, evs)
	await aggrAndTick()

	const { balances } = await channelIface.getOurLatestMsg('Accounting')
	t.equal(
		balances[dummyVals.ids.publisher],
		'1',
		'publisher balance should be charged according to promilles'
	)
	t.equal(
		balances[dummyVals.ids.publisher],
		'1',
		'publisher balance should be charged according to promilles'
	)
	t.end()
})

tape('should payout price per impression case for stat key', async function(t) {
	const id = 'pricePerImpressionCase'
	const channel = {
		...dummyVals.channel,
		id,
		validUntil,
		spec: {
			...dummyVals.channel.spec,
			minPerImpression: '1',
			withdrawPeriodStart
		}
	}

	const channelIface = new SentryInterface(dummyAdapter, channel, { logging: false })
	// Submit a new channel; we submit it to both sentries to avoid 404 when propagating messages
	await Promise.all([
		fetchPost(`${leaderUrl}/channel`, dummyVals.auth.leader, channel),
		fetchPost(`${followerUrl}/channel`, dummyVals.auth.follower, channel)
	])

	// send impression per case event
	await fetchPost(`${leaderUrl}/channel/${channel.id}/events`, dummyVals.auth.creator, {
		events: [
			{
				type: eventTypes.IMPRESSION_PRICE_PER_CASE,
				cases: [
					{
						stat: 'NG:Chromium:Android:tablet',
						price: '2'
					},
					{
						stat: `${dummyVals.ids.publisher2}:US:Chromium:Ubuntu:mobile`,
						price: '4'
					}
				]
			}
		]
	})
	await aggrAndTick()

	// post events for that channel for multiple publishers
	const publishers = [
		[
			dummyVals.auth.creator,
			genEvents(2, dummyVals.ids.publisher),
			{
				'CF-IPcountry': 'NG',
				'User-Agent':
					'Mozilla/5.0 (Linux; Android 4.4.2; Nexus 7 Build/KOT49H) AppleWebKit/535.2 (KHTML, like Gecko) Ubuntu/11.10 Chromium/15.0.874.106 Chrome/15.0.874.106 Safari/535.2'
			}
		],
		[
			dummyVals.auth.creator,
			genEvents(2, dummyVals.ids.publisher),
			{
				'CF-IPcountry': 'NG'
			}
		],
		[
			dummyVals.auth.creator,
			genEvents(2, dummyVals.ids.publisher2),
			{
				'CF-IPcountry': 'US',
				'User-Agent':
					'Mozilla/5.0 (iPhone; CPU iPhone OS 7_0 like Mac OS X) AppleWebKit/535.2 (KHTML, like Gecko) Ubuntu/11.10 Chromium/15.0.874.106 Chrome/15.0.874.106 Safari/535.2'
			}
		]
	]

	await Promise.all(
		publishers.map(async ([auth, event, headers]) =>
			postEvents(leaderUrl, id, event, auth, headers).then(res => res.json())
		)
	)

	await aggrAndTick()
	await forceTick()

	const { balances } = await channelIface.getOurLatestMsg('Accounting')
	t.equal(balances.myAwesomePublisher, '4', 'should have valid accounting')
	t.equal(balances.myAwesomePublisher2, '6', 'should have valid accounting')
	t.end()
})

tape('should pause channel', async function(t) {
	const channel = {
		...dummyVals.channel,
		id: 'pauseChannel',
		validUntil,
		spec: {
			...dummyVals.channel.spec,
			withdrawPeriodStart
		}
	}

	const channelIface = new SentryInterface(dummyAdapter, channel, { logging: false })

	// Submit a new channel; we submit it to both sentries to avoid 404 when propagating messages
	await Promise.all([
		fetchPost(`${leaderUrl}/channel`, dummyVals.auth.leader, channel),
		fetchPost(`${followerUrl}/channel`, dummyVals.auth.follower, channel)
	])

	// 1 event pays 1 token for now
	await postEvents(leaderUrl, channel.id, genEvents(10))
	// post update channel price event
	await fetchPost(`${leaderUrl}/channel/${channel.id}/events`, dummyVals.auth.creator, {
		events: [{ type: 'PAUSE_CHANNEL' }]
	})

	await aggrAndTick()

	// 1 event pays 3 tokens now;
	const result = await postEvents(leaderUrl, channel.id, genEvents(10)).then(res => res.json())
	t.equal(result.success, false, 'should fail to post events on a paused channel')
	t.equal(result.statusCode, 400, 'should have a 400 status')
	t.equal(result.message, 'channel is paused', 'should return a channel is paused message')

	// ensure publisher balance did not change
	const { balances } = await channelIface.getOurLatestMsg('Accounting')
	t.equal(
		balances[dummyVals.ids.publisher],
		'8',
		'publisher balance should be charged according to new price'
	)
	t.end()
})
