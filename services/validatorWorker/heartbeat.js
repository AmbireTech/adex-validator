const BN = require('bn.js')
const cfg = require('../../cfg')
const { sumMap } = require('./lib/followerRules')

async function sendHeartbeat(adapter, iface, channel) {
	const timestamp = Buffer.alloc(32)
	timestamp.writeUIntBE(Date.now(), 26, 6)

	// in the future, we can add more information to this tree,
	// such as the validator node capacity/status,
	// or a proof of 'no earlier than' (hash of the latest blockchain block)
	const tree = new adapter.MerkleTree([timestamp])
	const infoRootRaw = tree.getRoot()

	const stateRootRaw = adapter.getSignableStateRoot(channel.id, infoRootRaw)
	const signature = await adapter.sign(stateRootRaw)
	const stateRoot = stateRootRaw.toString('hex')
	return iface.propagate([
		{
			type: 'Heartbeat',
			timestamp: new Date(),
			signature,
			stateRoot
		}
	])
}

async function heartbeat(adapter, iface, channel, balances) {
	const heartbeatMsg = await iface.getOurLatestMsg('Heartbeat')
	const shouldSend =
		(!heartbeatMsg ||
			Date.now() - new Date(heartbeatMsg.timestamp).getTime() > cfg.HEARTBEAT_TIME) &&
		isChannelNotExhausted(channel, balances)

	if (shouldSend) {
		await sendHeartbeat(adapter, iface, channel)
	}
}

function isChannelNotExhausted(channel, balances) {
	return !sumMap(balances).eq(new BN(channel.depositAmount))
}

module.exports = { heartbeat }
