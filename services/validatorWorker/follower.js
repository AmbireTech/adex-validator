const assert = require('assert')
const db = require('../../db')
const { persistAndPropagate } = require('./lib/propagation')
const { isValidRootHash, isValidValidatorFees, onError, toBNMap } = require('./lib')
const { isValidTransition, isHealthy } = require('./lib/followerRules')
const producer = require('./producer')
const { heartbeatIfNothingNew } = require('./heartbeat')

async function tick(adapter, channel) {
	// @TODO: there's a flaw if we use this in a more-than-two validator setup
	// SEE https://github.com/AdExNetwork/adex-validator-stack-js/issues/4
	const [newMsg, approveMsg] = await Promise.all([
		getLatestMsg(channel.id, channel.validators[0], 'NewState'),
		getLatestMsg(channel.id, adapter.whoami(), 'ApproveState').then(augmentWithBalances)
	])
	const latestIsApproved = newMsg && approveMsg && newMsg.stateRoot === approveMsg.stateRoot

	// there are no unapproved NewState messages, only merge all eventAggrs
	const res =
		!newMsg || latestIsApproved
			? await producer.tick(channel).then(r => ({ nothingNew: !r.newStateTree }))
			: await producer
					.tick(channel, true)
					.then(r => onNewState(adapter, { ...r, newMsg, approveMsg }))

	return heartbeatIfNothingNew(adapter, channel, res)
}

async function onNewState(adapter, { channel, balances, newMsg, approveMsg }) {
	const prevBalances = toBNMap(approveMsg ? approveMsg.balances : {})
	const newBalances = toBNMap(newMsg.balances)
	const newBalancesAfterFees = toBNMap(newMsg.balancesAfterFees)

	if (!isValidTransition(channel, prevBalances, newBalances)) {
		return onError(adapter, channel, { reason: 'InvalidTransition', newMsg })
	}

	if (!isValidValidatorFees(channel, newBalances, newBalancesAfterFees)) {
		return onError(adapter, channel, { reason: `InvalidValidatorFees`, newMsg })
	}

	// verify the stateRoot hash of newMsg: whether the stateRoot really represents this balance tree
	if (!isValidRootHash(adapter, newMsg.stateRoot, channel, newBalancesAfterFees)) {
		return onError(adapter, channel, { reason: `InvalidRootHash`, newMsg })
	}
	// verify the signature of newMsg: whether it was signed by the leader validator
	const leader = channel.spec.validators[0]
	const isValidSig = await adapter.verify(leader.id, newMsg.stateRoot, newMsg.signature)
	if (!isValidSig) {
		return onError(adapter, channel, { reason: `InvalidSignature`, newMsg })
	}

	const { stateRoot } = newMsg
	const stateRootRaw = Buffer.from(stateRoot, 'hex')
	const signature = await adapter.sign(stateRootRaw)
	const whoami = adapter.whoami()
	const otherValidators = channel.spec.validators.filter(v => v.id !== whoami)
	return persistAndPropagate(adapter, otherValidators, channel, {
		type: 'ApproveState',
		stateRoot,
		isHealthy: isHealthy(balances, newBalances),
		signature,
		created: Date.now()
	})
}

// @TODO getLatestMsg should be a part of a DB abstraction so we can use it in other places too
// e.g. validating on POST /validator-messages (to get the previous), and a public API to get the latest msgs of a type
function getLatestMsg(channelId, from, type) {
	const validatorMsgCol = db.getMongo().collection('validatorMessages')

	return validatorMsgCol
		.find({
			channelId,
			from,
			'msg.type': type
		})
		.sort({ 'msg.created': -1 })
		.limit(1)
		.toArray()
		.then(function([o]) {
			return o ? o.msg : null
		})
}

// ApproveState messages do not contain the full `balances`; so augment them
function augmentWithBalances(approveMsg) {
	if (!approveMsg) return Promise.resolve()

	const validatorMsgCol = db.getMongo().collection('validatorMessages')
	return validatorMsgCol
		.findOne({
			'msg.type': 'NewState',
			'msg.stateRoot': approveMsg.stateRoot
		})
		.then(function(o) {
			assert.ok(
				o && o.msg && o.msg.balances,
				'cannot find NewState message corresponding to the ApproveState'
			)
			return { ...approveMsg, balances: o.msg.balances }
		})
}

module.exports = { tick }
