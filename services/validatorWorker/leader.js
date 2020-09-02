const BN = require('bn.js')
const { getStateRootHash, toBNMap, sumMap } = require('./lib')
const producer = require('./producer')
const { heartbeat } = require('./heartbeat')

async function tick(adapter, iface, channel) {
	const res = await producer.tick(iface, channel)

	if (res.newAccounting) {
		await onNewAccounting(adapter, iface, channel, res)
	}

	await heartbeat(adapter, iface, channel)
}

async function onNewAccounting(adapter, iface, channel, { newAccounting }) {
	const stateRootRaw = getStateRootHash(adapter, channel, newAccounting.balances)
	const signature = await adapter.sign(stateRootRaw)
	const stateRoot = stateRootRaw.toString('hex')
	const exhausted = sumMap(toBNMap(newAccounting.balances)).eq(new BN(channel.depositAmount))
	return iface.propagate([
		{
			type: 'NewState',
			balances: newAccounting.balances,
			stateRoot,
			signature,
			exhausted
		}
	])
}

module.exports = { tick }
