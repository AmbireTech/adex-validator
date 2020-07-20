const BN = require('bn.js')
const { getStateRootHash, toBNMap, sumMap } = require('./lib')
const producer = require('./producer')
const { heartbeat } = require('./heartbeat')

async function tick(adapter, iface, channel) {
	const res = await producer.tick(iface, channel)

	let channelExhausted = sumMap(toBNMap(res.accounting.balances)).eq(new BN(channel.depositAmount))
	if (res.newAccounting) {
		channelExhausted = sumMap(toBNMap(res.newAccounting.balances)).eq(new BN(channel.depositAmount))
		await onNewAccounting(adapter, iface, channel, res, channelExhausted)
	}

	if (!channelExhausted) {
		await heartbeat(adapter, iface, channel)
	}
}

async function onNewAccounting(adapter, iface, channel, { newAccounting }, channelExhausted) {
	const stateRootRaw = getStateRootHash(adapter, channel, newAccounting.balances)
	const signature = await adapter.sign(stateRootRaw)
	const stateRoot = stateRootRaw.toString('hex')
	return iface.propagate([
		{
			type: 'NewState',
			balances: newAccounting.balances,
			stateRoot,
			signature,
			exhausted: channelExhausted
		}
	])
}

module.exports = { tick }
