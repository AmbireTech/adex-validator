const adapter = require('../../adapter')
const db = require('../../db')
const propagateMsg = require('./lib/propagateMsg')

function tick({ channel, newStateTree, balances }) {
	// Note: MerkleTree takes care of deduplicating and sorting
	const elems = Object.keys(balances).map(acc => adapter.getBalanceLeaf(acc, balances[acc]))
	const tree = new adapter.MerkleTree(elems)
	const stateRoot = tree.getRoot()
	const sig = adapter.sign(stateRoot)
	return persistAndPropagateValidatorMsg(channel, {
		type: 'NewState',
		...newStateTree,
		stateRoot,
		sig,
	})
}

function persistAndPropagateValidatorMsg(channel, msg) {
	// @TODO: figure out how to ensure the channel object is valid before reaching here; probably in the watcher
	const validatorMsgCol = db.getMongo().collection('validatorMessages')
	const followers = channel.spec.validators.slice(1)

	return validatorMsgCol.insertOne(msg)
	.then(function() {
		return Promise.all(
			followers.map(v => propagateMsg(channel, v, msg))
		)
	})
	// @TODO: more graceful err handling
}

module.exports = { tick }

