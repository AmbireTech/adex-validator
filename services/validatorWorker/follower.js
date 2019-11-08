const BN = require('bn.js')
const { getStateRootHash, onError, toBNMap } = require('./lib')
const { isValidTransition, getHealthPromilles } = require('./lib/followerRules')
const producer = require('./producer')
const { heartbeat } = require('./heartbeat')
const cfg = require('../../cfg')

async function tick(adapter, iface, channel) {
	// @TODO: there's a flaw if we use this in a more-than-two validator setup
	// SEE https://github.com/AdExNetwork/adex-validator-stack-js/issues/4
	const [newMsg, responseMsg] = await Promise.all([
		iface.getLatestMsg(channel.spec.validators[0].id, 'NewState'),
		iface.getOurLatestMsg('ApproveState+RejectState')
	])
	const latestIsRespondedTo = newMsg && responseMsg && newMsg.stateRoot === responseMsg.stateRoot

	// there are no unapproved NewState messages, only merge all eventAggrs
	const { balances } = await producer.tick(iface, channel)
	if (newMsg && !latestIsRespondedTo) {
		await onNewState(adapter, iface, channel, balances, newMsg)
	}

	await heartbeat(adapter, iface, channel)
}

async function onNewState(adapter, iface, channel, balances, newMsg) {
	const proposedBalances = toBNMap(newMsg.balances)
	const stateRoot = newMsg.stateRoot
	const stateRootRaw = Buffer.from(stateRoot, 'hex')

	// verify the stateRoot hash of newMsg: whether the stateRoot really represents this balance tree
	if (stateRoot !== getStateRootHash(adapter, channel, proposedBalances).toString('hex')) {
		return onError(iface, { reason: 'InvalidRootHash', newMsg })
	}
	// verify the signature of newMsg: whether it was signed by the leader validator
	const isValidSig = await adapter.verify(
		channel.spec.validators[0].id,
		stateRootRaw,
		newMsg.signature
	)
	if (!isValidSig) {
		return onError(iface, { reason: 'InvalidSignature', newMsg })
	}

	const lastApproved = await iface.getLastApproved()
	const prevBalances = lastApproved ? toBNMap(lastApproved.newState.msg.balances) : {}
	if (!isValidTransition(channel, prevBalances, proposedBalances)) {
		return onError(iface, { reason: 'InvalidTransition', newMsg })
	}

	const healthPromilles = getHealthPromilles(channel, balances, proposedBalances)
	// if (healthPromilles.

	const signature = await adapter.sign(stateRootRaw)
	return iface.propagate([
		{
			type: 'ApproveState',
			stateRoot,
			isHealthy: healthPromilles.gte(new BN(cfg.HEALTH_THRESHOLD_PROMILLES)),
			signature
		}
	])
}

module.exports = { tick }
