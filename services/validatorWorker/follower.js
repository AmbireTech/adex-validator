const { isValidRootHash, onError, toBNMap } = require('./lib')
const { isValidTransition, isHealthy } = require('./lib/followerRules')
const producer = require('./producer')
const { heartbeat } = require('./heartbeat')

async function tick(adapter, iface, channel) {
	// @TODO: there's a flaw if we use this in a more-than-two validator setup
	// SEE https://github.com/AdExNetwork/adex-validator-stack-js/issues/4
	const [newMsg, responseMsg] = await Promise.all([
		iface.getLatestMsg(channel.validators[0], 'NewState'),
		iface.getLatestMsg(adapter.whoami(), 'ApproveState+RejectState')
	])
	const latestIsRespondedTo = newMsg && responseMsg && newMsg.stateRoot === responseMsg.stateRoot

	// there are no unapproved NewState messages, only merge all eventAggrs
	if (!newMsg || latestIsRespondedTo) {
		await producer.tick(adapter, iface, channel)
	} else {
		const { balances } = await producer.tick(adapter, iface, channel, true)
		await onNewState(adapter, iface, { channel, balances, newMsg })
	}

	await heartbeat(adapter, iface, channel)
}

async function onNewState(adapter, iface, { channel, balances, newMsg }) {
	const newBalances = toBNMap(newMsg.balances)

	// verify the stateRoot hash of newMsg: whether the stateRoot really represents this balance tree
	if (!isValidRootHash(adapter, newMsg.stateRoot, channel, newBalances)) {
		return onError(iface, { reason: 'InvalidRootHash', newMsg })
	}
	// verify the signature of newMsg: whether it was signed by the leader validator
	const leader = channel.spec.validators[0]
	const isValidSig = await adapter.verify(leader.id, newMsg.stateRoot, newMsg.signature)
	if (!isValidSig) {
		return onError(iface, { reason: 'InvalidSignature', newMsg })
	}

	const lastApproved = await iface.getLastApproved()
	const prevBalances = lastApproved ? toBNMap(lastApproved.newState.msg.balances) : {}
	if (!isValidTransition(channel, prevBalances, newBalances)) {
		return onError(iface, { reason: 'InvalidTransition', newMsg })
	}

	const { stateRoot } = newMsg
	const stateRootRaw = Buffer.from(stateRoot, 'hex')
	const signature = await adapter.sign(stateRootRaw)
	return iface.propagate([
		{
			type: 'ApproveState',
			stateRoot,
			isHealthy: isHealthy(balances, newBalances),
			signature
		}
	])
}

module.exports = { tick }
