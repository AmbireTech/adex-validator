const cfg = require('../../cfg')

async function sendHeartbeat(adapter, iface, channel) {
	const timestamp = Buffer.alloc(32)
	timestamp.writeUIntBE(Date.now(), 26, 6)

	// in the future, we can add more information to this tree,
	// such as the validator node capacity/status,
	// or a proof of 'no earlier than' (hash of the latest blockchain block)
	const tree = new adapter.MerkleTree([timestamp])
	const infoRootRaw = tree.getRoot()

	const stateRootRaw = adapter.getSignableStateRoot(Buffer.from(channel.id), infoRootRaw)
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

async function heartbeat(adapter, iface, channel) {
	const heartbeatMsg = await iface.getLatestMsg(adapter.whoami(), 'Heartbeat')
	const shouldSend =
		!heartbeatMsg || Date.now() - new Date(heartbeatMsg.timestamp).getTime() > cfg.HEARTBEAT_TIME

	if (shouldSend) {
		await sendHeartbeat(adapter, iface, channel)
	}
}

module.exports = { heartbeat }
