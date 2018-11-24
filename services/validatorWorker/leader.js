const adapter = require('../../adapter')

function tick({ channel, newStateTree, balances }) {
	// Note: MerkleTree takes care of deduplicating and sorting
	const elems = Object.keys(balances).map(acc => adapter.getBalanceLeaf(acc, balances[acc]))
	const tree = new adapter.MerkleTree(elems)
	const stateRoot = tree.getRoot()
	const sig = adapter.sign(stateRoot)
	return persistAndPropagateValidatorEv(channel, { ...newStateTree, stateRoot, sig })
}

function persistAndPropagateValidatorEv(channel, ev) {
	// @TODO: figure out how to ensure the channel object is valid before reaching here; probably in the watcher
	// @TODO: persist and propagate
	console.log(ev)
	return Promise.resolve()
}

module.exports = { tick }

