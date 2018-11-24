const fetch = require('node-fetch')
const adapter = require('../../adapter')
const db = require('../../db')

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
			followers.map(v => propagateMsgTo(channel, v, msg))
		)
	})
}

// @TODO: this func will be shared b/w leader.js and follower.js
function propagateMsgTo(channel, validator, msg) {
	return adapter.getAuthFor(validator)
	.then(function(authToken) {
		return fetch(`${validator.url}/channel/${channel.id}/validator-messages`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'authorization': `Bearer ${authToken}`
			},
			body: JSON.stringify({ messages: [msg] }),
		})
		.then(function(resp) {
			if (resp.status !== 200) {
				return Promise.reject('request failed with status code ' + resp.status)
			}
			return resp.json()
		})
		// @TODO: more graceful err handling
	})
}

module.exports = { tick }

