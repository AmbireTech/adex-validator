const { getStateRootHash } = require('./lib')
const producer = require('./producer')
const { heartbeat } = require('./heartbeat')

async function tick(adapter, iface, channel) {
	const res = await producer.tick(adapter, iface, channel)
	if (res.newAccounting) {
		await afterProducer(adapter, iface, res)
	}
	await heartbeat(adapter, iface, channel)
}

async function afterProducer(adapter, iface, { channel, newAccounting, balances }) {
	const stateRootRaw = getStateRootHash(adapter, channel, balances)
	const signature = await adapter.sign(stateRootRaw)
	const stateRoot = stateRootRaw.toString('hex')
	return iface.propagate([
		{
			type: 'NewState',
			balances: newAccounting.balances,
			stateRoot,
			signature
		}
	])
}

module.exports = { tick }
