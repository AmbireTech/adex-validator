const adapter = require('../../adapter')
const { persistAndPropagate } = require('./lib/propagation')

function tick({channel, newStateTree, balances}) {
	const followers = channel.spec.validators.slice(1)
	// Note: MerkleTree takes care of deduplicating and sorting
	const elems = Object.keys(balances).map(acc => adapter.getBalanceLeaf(acc, balances[acc]))
	const tree = new adapter.MerkleTree(elems)
	const stateRootRaw = tree.getRoot()
	const sig = adapter.sign(stateRootRaw)
	const stateRoot = stateRootRaw.toString('hex')
	return persistAndPropagate(followers, channel, {
		type: 'NewState',
		...newStateTree,
		stateRoot,
		sig,
	})
}

module.exports = { tick }

