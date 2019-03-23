const { getStateRootHash } = require('./lib')
const producer = require('./producer')
const { heartbeat } = require('./heartbeat')

async function tick(adapter, iface, channel) {
	const res = await producer.tick(iface, channel)
	if (res.newStateTree) {
		await afterProducer(adapter, iface, res)
	}
	await heartbeat(adapter, iface, channel)
}

async function afterProducer(adapter, iface, { channel, newStateTree, balancesAfterFees }) {
	const stateRootRaw = getStateRootHash(adapter, channel, balancesAfterFees)
	const signature = await adapter.sign(stateRootRaw)
	const stateRoot = stateRootRaw.toString('hex')
	return iface.propagate([
		{
			type: 'NewState',
			balances: newStateTree.balancesAfterFees,
			stateRoot,
			signature
		}
	])
}

module.exports = { tick }
