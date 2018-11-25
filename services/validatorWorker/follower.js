const BN = require('bn.js')
const assert = require('assert')
const db = require('../../db')
const adapter = require('../../adapter')
const { persistAndPropagate } = require('./lib/propagation')
const producer = require('./producer')

// in primilles
const HEALTH_THRESHOLD = new BN(950)

function tick(channel) {
	// @TODO: there's a flaw if we use this in a more-than-two validator setup
	// SEE https://github.com/AdExNetwork/adex-validator-stack-js/issues/4
	return Promise.all([
		getLatestMsg(channel.id, channel.validators[0], 'NewState'),
		getLatestMsg(channel.id, adapter.whoami(), 'ApproveState')
			.then(augmentWithBalances),
	])
	.then(function([newMsg, approveMsg]) {
		const latestApproved = newMsg && approveMsg && newMsg.stateRoot == approveMsg.stateRoot 
		if (!newMsg || latestApproved) {
			// there are no NewState messages, only merge all eventAggrs
			return producer.tick(channel)
			.then(function(res) {
				return { nothingNew: !res.newStateTree }
			})
		}

		return producer.tick(channel, true)
		.then(function(res) {
			return onNewState({ ...res, newMsg, approveMsg })
		})
	})
}

function onNewState({channel, newStateTree, balances, newMsg, approveMsg}) {
	const prevBalances = toBalanceTree(approveMsg ? approveMsg.balances : {})
	const newBalances = toBalanceTree(newMsg.balances)
	if (!isValidTransition(channel, prevBalances, newBalances)) {
		console.error(`validatatorWorker: ${channel.id}: invalid transition requested in NewState`, prevBalances, newBalances)
		return { nothingNew: true }
	}

	const stateRoot = newMsg.stateRoot
	const signature = adapter.sign(stateRoot)
	const otherValidators = channel.spec.validators.filter(v => v.id != adapter.whoami())
	return persistAndPropagate(otherValidators, channel, {
		type: 'ApproveState',
		stateRoot: stateRoot,
		health: getHealth(channel, balances, newBalances),
		signature,
	})
}

// Implements constraints described at: https://github.com/AdExNetwork/adex-protocol/blob/master/OUTPACE.md#specification
function isValidTransition(channel, prev, next) {
	const sumPrev = sumTree(prev)
	const sumNext = sumTree(next)
	return sumNext >= sumPrev
		&& sumNext <= channel.depositAmount
		&& Object.entries(prev).every(([acc, bal]) => {
			const nextBal = next[acc]
			if (!nextBal) return false
			return nextBal.gte(bal)
		})
}

function getHealth(channel, our, approved) {
	const sumOur = sumTree(our)
	const sumApproved = sumTree(approved)
	if (sumApproved.gte(sumOur)) {
		return 'HEALTHY'
	}
	if (sumApproved.mul(new BN(1000)).div(sumOur).lt(HEALTH_THRESHOLD)) {
		return 'UNHEALTHY'
	}
	return 'HEALTHY'
}

function sumTree(tree) {
	return Object.values(tree).reduce((a,b) => a.add(b), new BN(0))
}

function toBalanceTree(raw) {
	assert.ok(raw && typeof(raw) === 'object', 'raw tree is a valid object')
	const balances = {}
	Object.entries(raw).forEach(([acc, bal]) => balances[acc] = new BN(bal, 10))
	return balances
}

function getLatestMsg(channelId, from, type) {
	const validatorMsgCol = db.getMongo().collection('validatorMessages')
	// @TODO: this assumption of getting the latest is flawed; won't work if it's within the same second: https://docs.mongodb.com/manual/reference/method/ObjectId/
	// it is very important that we get this right, since it will be used to gather data about the channel state too
	return validatorMsgCol.find({
		channelId,
		from: from,
		'msg.type': type,
	})
	.sort({ _id: -1 })
	.limit(1)
	.toArray()
	.then(function([o]) {
		// @TODO assert validity
		return o ? o.msg : null
	})
}

// ApproveState messages do not contain the full `balances`; so augment them
function augmentWithBalances(approveMsg) {
	if (!approveMsg) return

	// @TODO: DB index
	const validatorMsgCol = db.getMongo().collection('validatorMessages')
	return validatorMsgCol.findOne({
		'msg.type': 'NewState',
		'msg.stateRoot': approveMsg.stateRoot,
	})
	.then(function(o) {
		assert.ok(o && o.msg && o.msg.balances, 'cannot find NewState message corresponding to the ApproveState')
		return { ...approveMsg, balances: o.msg.balances }
	})
}

module.exports = { tick }

