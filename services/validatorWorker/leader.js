const { persistAndPropagate } = require('./lib/propagation')
const { getStateRootHash } = require('./lib')
const producer = require('./producer')
const { heartbeat } = require('./heartbeat')

async function tick(adapter, channel) {
	const res = await producer.tick(channel)
	if (res.newStateTree) {
		await afterProducer(adapter, res)
	}
	await heartbeat(adapter, channel)
}

async function afterProducer(adapter, { channel, newStateTree, balancesAfterFees }) {
	const followers = channel.spec.validators.slice(1)
	const stateRootRaw = getStateRootHash(adapter, channel, balancesAfterFees)

	const signature = await adapter.sign(stateRootRaw)
	const stateRoot = stateRootRaw.toString('hex')
	return persistAndPropagate(adapter, followers, channel, {
		type: 'NewState',
		balances: newStateTree.balancesAfterFees,
		stateRoot,
		signature
	})
}

module.exports = { tick }
