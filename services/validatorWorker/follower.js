const fetch = require('node-fetch')
const db = require('../../db')
const { persistAndPropagate } = require('./lib/propagation')
const { isValidRootHash, onError, toBNMap } = require('./lib')
const { isValidTransition, isHealthy } = require('./lib/followerRules')
const producer = require('./producer')
const { heartbeat } = require('./heartbeat')

async function tick(adapter, channel) {
	// @TODO: there's a flaw if we use this in a more-than-two validator setup
	// SEE https://github.com/AdExNetwork/adex-validator-stack-js/issues/4
	const [newMsg, responseMsg] = await Promise.all([
		getLatestMsg(channel.id, channel.validators[0], 'NewState'),
		getLatestMsg(channel.id, adapter.whoami(), { $in: ['ApproveState', 'RejectState'] })
	])
	const latestIsRespondedTo = newMsg && responseMsg && newMsg.stateRoot === responseMsg.stateRoot

	// there are no unapproved NewState messages, only merge all eventAggrs
	if (!newMsg || latestIsRespondedTo) {
		await producer.tick(channel)
	} else {
		const res = await producer.tick(channel, true)
		await onNewState(adapter, { ...res, newMsg })
	}

	await heartbeat(adapter, channel)
}

async function onNewState(adapter, { channel, balancesAfterFees, newMsg }) {
	const newBalances = toBNMap(newMsg.balances)

	// verify the stateRoot hash of newMsg: whether the stateRoot really represents this balance tree
	if (!isValidRootHash(adapter, newMsg.stateRoot, channel, newBalances)) {
		return onError(adapter, channel, { reason: `InvalidRootHash`, newMsg })
	}
	// verify the signature of newMsg: whether it was signed by the leader validator
	const leader = channel.spec.validators[0]
	const isValidSig = await adapter.verify(leader.id, newMsg.stateRoot, newMsg.signature)
	if (!isValidSig) {
		return onError(adapter, channel, { reason: `InvalidSignature`, newMsg })
	}

	const lastApproved = await getLastApproved(adapter, channel)
	const prevBalances = lastApproved ? toBNMap(lastApproved.newState.msg.balances) : {}
	if (!isValidTransition(channel, prevBalances, newBalances)) {
		return onError(adapter, channel, { reason: 'InvalidTransition', newMsg })
	}

	const { stateRoot } = newMsg
	const stateRootRaw = Buffer.from(stateRoot, 'hex')
	const signature = await adapter.sign(stateRootRaw)
	const whoami = adapter.whoami()
	const otherValidators = channel.spec.validators.filter(v => v.id !== whoami)
	return persistAndPropagate(adapter, otherValidators, channel, {
		type: 'ApproveState',
		stateRoot,
		isHealthy: isHealthy(balancesAfterFees, newBalances),
		signature
	})
}

// @TODO: move into Sentry interface
function getLatestMsg(channelId, from, type) {
	const validatorMsgCol = db.getMongo().collection('validatorMessages')

	return validatorMsgCol
		.find({
			channelId,
			from,
			'msg.type': type
		})
		.sort({ received: -1 })
		.limit(1)
		.toArray()
		.then(function([o]) {
			return o ? o.msg : null
		})
}

// @TODO: move into Sentry interface
function getLastApproved(adapter, channel) {
	const whoami = adapter.whoami()
	const validator = channel.spec.validators.find(v => v.id !== whoami)
	// assert.ok(validator, 'has validator entry for whomai')
	const lastApprovedUrl = `${validator.url}/channel/${channel.id}/last-approved`
	return fetch(lastApprovedUrl)
		.then(res => res.json())
		.then(({ lastApproved }) => lastApproved)
}

module.exports = { tick }
