const fetch = require('node-fetch')
const db = require('../../../db')

function propagate(adapter, receiver, channel, msg) {
	return adapter.getAuthFor(receiver)
	.then(function(authToken) {
		return fetch(`${receiver.url}/channel/${channel.id}/validator-messages`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'authorization': `Bearer ${authToken}`
			},
			body: JSON.stringify({ messages: [msg] }),
		})
		.then(function(resp) {
			if (resp.status !== 200) {
				return Promise.reject(new Error('request failed with status code ' + resp.status))
			}
			return resp.json()
		})
	})
}

// receivers are the receiving validators
function persistAndPropagate(adapter, receivers, channel, msg) {
	logPropagate(receivers, channel, msg)
	// @TODO: figure out how to ensure the channel object is valid before reaching here; probably in the watcher
	const validatorMsgCol = db.getMongo().collection('validatorMessages')
	return validatorMsgCol.insertOne({
		channelId: channel.id,
		from: adapter.whoami(),
		msg,
	})
	.then(function() {
		return Promise.all(receivers.map(function(receiver) {
			return propagate(adapter, receiver, channel, msg)
			.catch(function(e) {
				console.error(`validatorWorker: Unable to propagate ${msg.type} to ${receiver.id}: ${e.message || e}`)
			})
		}))
	})
}

function logPropagate(receivers, channel, msg) {
	console.log(`validatorWorker: channel ${channel.id}: propagating ${msg.type} to ${receivers.length} validators`)
}

module.exports = { persistAndPropagate, propagate }
