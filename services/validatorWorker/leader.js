const { persistAndPropagate } = require('./lib/propagation')
const { getRootHash } = require('./lib/followerRules')

const producer = require('./producer')

function tick(adapter, channel) {
	return producer.tick(channel)
		.then(
			res => res.newStateTree ?
				afterProducer(adapter, res)
				: { nothingNew: true }
		)
}

function afterProducer(adapter, {channel, newStateTree, balances}) {
	const followers = channel.spec.validators.slice(1)
	// Note: MerkleTree takes care of deduplicating and sorting
	const stateRootRaw = getRootHash(channel, balances, adapter)
	
	// keccak256(channelId, balanceRoot)
	return adapter.sign(stateRootRaw)
	.then(function(signature) {
		const stateRoot = stateRootRaw.toString('hex')
		return persistAndPropagate(adapter, followers, channel, {
			type: 'NewState',
			...newStateTree,
			stateRoot,
			signature,
		})
	})
}

module.exports = { tick }

