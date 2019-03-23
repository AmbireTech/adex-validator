const assert = require('assert')
const BN = require('bn.js')
const { persist } = require('./propagation')

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

function invalidNewState(adapter, channel, { reason, newMsg }) {
	// quirk: type is overiding type in newMsg
	return persist(adapter, channel, {
		...newMsg,
		type: 'RejectState',
		reason
	})
}

function onError(adapter, channel, { reason, newMsg }) {
	const errMsg = getErrorMsg(reason, channel)

	return invalidNewState(adapter, channel, { reason, newMsg }).then(function() {
		console.error(errMsg)
		return { nothingNew: true }
	})
}

function getErrorMsg(reason, channel) {
	return `validatatorWorker: ${channel.id}: ${reason} error in NewState`
}

module.exports = {
	getStateRootHash,
	isValidRootHash,
	toBNMap,
	toBNStringMap,
	onError
}
