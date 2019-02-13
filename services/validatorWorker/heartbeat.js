const assert = require('assert')
const { persistAndPropagate } = require('./lib/propagation')

function heartbeat(adapter, channel){
	const whoami = adapter.whoami()
	const validatorIdx = channel.validators.indexOf(whoami)
	assert.ok(validatorIdx !== -1, 'validatorTick: sending heartbeat for a channel where we are not validating')
	const otherValidators = channel.spec.validators.filter(v => v.id != whoami)

	let timestamp = Buffer.alloc(32);
	timestamp.writeUIntBE(Date.now(), 26, 6);

	// in the future, we can add more information to this tree, 
	// such as the validator node capacity/status, 
	// or a proof of 'no earlier than' (hash of the latest blockchain block)
	const tree = new adapter.MerkleTree([ timestamp ])
	const infoRootRaw = tree.getRoot()

	const stateRootRaw = adapter.getSignableStateRoot(Buffer.from(channel.id), infoRootRaw)

	return adapter.sign(stateRootRaw)
	.then(function(signature) {
		const stateRoot = stateRootRaw.toString('hex')
		timestamp = timestamp.toString('hex')

		return persistAndPropagate(adapter, otherValidators, channel, {
			type: 'HeartBeat',
			timestamp,
			signature,
			stateRoot,
		});
	})
}

module.exports = heartbeat
