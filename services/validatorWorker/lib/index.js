const assert = require('assert')
const BN = require('bn.js')

function getStateRootHash(adapter, channel, balances) {
	// Note: MerkleTree takes care of deduplicating and sorting
	const elems = Object.keys(balances).map(acc => adapter.getBalanceLeaf(acc, balances[acc]))
	const tree = new adapter.MerkleTree(elems)
	const balanceRoot = tree.getRoot()
	// keccak256(channelId, balanceRoot)
	return adapter.getSignableStateRoot(channel.id, balanceRoot)
}

function toBNMap(raw) {
	assert.ok(raw && typeof raw === 'object', 'raw map is a valid object')
	const balances = {}
	Object.entries(raw).forEach(([acc, bal]) => {
		const bnBal = new BN(bal, 10)
		assert.ok(!bnBal.isNeg(), 'balance should not be negative')
		balances[acc] = bnBal
	})
	return balances
}

function toBNStringMap(raw) {
	assert.ok(raw && typeof raw === 'object', 'raw map is a valid object')
	const balances = {}
	Object.entries(raw).forEach(([acc, bal]) => {
		assert.ok(!bal.isNeg(), 'balance should not be negative')
		balances[acc] = bal.toString(10)
	})
	return balances
}

function onError(iface, { reason, newMsg }) {
	return iface.propagate([
		{
			...newMsg,
			type: 'RejectState',
			reason
		}
	])
}

function sumBNs(bns) {
	return bns.reduce((a, b) => a.add(b), new BN(0))
}

function sumMap(all) {
	return sumBNs(Object.values(all))
}

module.exports = {
	getStateRootHash,
	toBNMap,
	toBNStringMap,
	onError,
	sumMap,
	sumBNs
}
