const assert = require('assert')
const BN = require('bn.js')

function getStateRootHash(adapter, channel, balances) {
	// Note: MerkleTree takes care of deduplicating and sorting
	const elems = Object.keys(balances).map(acc => adapter.getBalanceLeaf(acc, balances[acc]))
	const tree = new adapter.MerkleTree(elems)
	const balanceRoot = tree.getRoot()
	// keccak256(channelId, balanceRoot)
	const stateRoot = adapter
		.getSignableStateRoot(Buffer.from(channel.id), balanceRoot)
		.toString('hex')
	return stateRoot
}

function isValidRootHash(adapter, leaderRootHash, channel, balances) {
	return getStateRootHash(adapter, channel, balances) === leaderRootHash
}

function toBNMap(raw) {
	assert.ok(raw && typeof raw === 'object', 'raw map is a valid object')
	const balances = {}
	Object.entries(raw).forEach(([acc, bal]) => {
		balances[acc] = new BN(bal, 10)
	})
	return balances
}

function toBNStringMap(raw) {
	assert.ok(raw && typeof raw === 'object', 'raw map is a valid object')
	const balances = {}
	Object.entries(raw).forEach(([acc, bal]) => {
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

module.exports = {
	getStateRootHash,
	isValidRootHash,
	toBNMap,
	toBNStringMap,
	onError
}
