// NOTE: should this go through the adapter?
const { MerkleTree, Channel, ChannelState } = require('adex-protocol-eth/js')
const adapter = require('../../adapter')

function tick({ channel, newStateTree, balances }) {
	// Note: MerkleTree takes care of deduplicating and sorting
	const elems = Object.keys(balances).map(acc => Channel.getBalanceLeaf(acc, balances[acc]))
	const tree = new MerkleTree(elems)
	const stateRoot = tree.getRoot()
	const sig = adapter.sign(stateRoot)
	return persistAndPropagateValidatorEv({ ...newStateTree, stateRoot, sig })
}

function persistAndPropagateValidatorEv(ev) {
	// @TODO: persist and propagate
	console.log(ev)
	return Promise.resolve()
}

module.exports = { tick }

