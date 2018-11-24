const adapter = require('../../adapter')
const db = require('../../db')
const propagateMsg = require('./lib/propagateMsg')

function tick({channel, newStateTree, balances}) {
	const followers = channel.spec.validators.slice(1)
	// Note: MerkleTree takes care of deduplicating and sorting
	const elems = Object.keys(balances).map(acc => adapter.getBalanceLeaf(acc, balances[acc]))
	const tree = new adapter.MerkleTree(elems)
	const stateRoot = tree.getRoot()
	const sig = adapter.sign(stateRoot)
	return persistAndPropagateValidatorMsg(followers, channel, {
		type: 'NewState',
		...newStateTree,
		stateRoot: stateRoot.toString('hex'),
		sig,
	})
}

function persistAndPropagateValidatorMsg(receivers, channel, msg) {
	// @TODO: figure out how to ensure the channel object is valid before reaching here; probably in the watcher
	const validatorMsgCol = db.getMongo().collection('validatorMessages')
	return validatorMsgCol.insertOne({
		channelId: channel.id,
		from: adapter.whoami(),
		msg,
	})
	.then(function() {
		return Promise.all(receivers.map(function(validator) {
			return propagateMsg(channel, validator, msg)
			.catch(function(e) {
				console.error(`validatorWorker: Unable to propagate ${msg.type} to ${validator.id}: ${e.message}`)
			})
		}))
	})
}

module.exports = { tick }

