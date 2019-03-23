const fetch = require('node-fetch')
const { persistAndPropagate } = require('./lib/propagation')
const cfg = require('../../cfg')

async function sendHeartbeat(adapter, channel) {
	const whoami = adapter.whoami()

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
	const otherValidators = channel.spec.validators.filter(v => v.id !== whoami)
	return persistAndPropagate(adapter, otherValidators, channel, {
		type: 'Heartbeat',
		timestamp: new Date(),
		signature,
		stateRoot
	})
}

async function heartbeat(adapter, channel) {
	const heartbeatMsg = await getOurLatestMsg(adapter, channel, 'Heartbeat')
	const shouldSend = !heartbeatMsg ||
		Date.now() - new Date(heartbeatMsg.timestamp).getTime() > cfg.HEARTBEAT_TIME
	
	if (shouldSend) {
		await sendHeartbeat(adapter, channel)
	}
}

// @TODO: move into Sentry interface
function getOurLatestMsg(adapter, channel, type) {
	const whoami = adapter.whoami()
	const validator = channel.spec.validators.find(v => v.id == whoami)
	// assert.ok(validator, 'has validator entry for whomai')
	const url = `${validator.url}/channel/${channel.id}/validator-messages/${
		validator.id
	}/${type}?limit=1`
	return fetch(url)
		.then(res => res.json())
		.then(({ validatorMessages }) => (validatorMessages.length ? validatorMessages[0].msg : null))
}

module.exports = { heartbeat }
