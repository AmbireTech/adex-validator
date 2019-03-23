const { persistAndPropagate } = require('./lib/propagation')
const { getStateRootHash } = require('./lib')
const producer = require('./producer')
const { heartbeatIfNothingNew } = require('./heartbeat')

function tick(adapter, channel) {
	return producer
		.tick(channel)
		.then(res => (res.newStateTree ? afterProducer(adapter, res) : { nothingNew: true }))
		.then(res => heartbeatIfNothingNew(adapter, channel, res))
}

async function afterProducer(adapter, { channel, newStateTree, balancesAfterFees }) {
	const followers = channel.spec.validators.slice(1)
	const stateRootRaw = getStateRootHash(adapter, channel, balancesAfterFees)

	const signature = await adapter.sign(stateRootRaw)
	const stateRoot = stateRootRaw.toString('hex')
	return persistAndPropagate(adapter, followers, channel, {
		type: 'NewState',
		...newStateTree,
		stateRoot,
		signature
	})
}

module.exports = { tick }
