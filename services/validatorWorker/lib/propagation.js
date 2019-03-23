const fetch = require('node-fetch')
const db = require('../../../db')

async function propagate(adapter, receiver, channel, msg) {
	const authToken = await adapter.getAuthFor(receiver)
	const resp = await fetch(`${receiver.url}/channel/${channel.id}/validator-messages`, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${authToken}`
		},
		body: JSON.stringify({ messages: [msg] })
	})
	if (resp.status !== 200) {
		return Promise.reject(new Error(`request failed with status code ${resp.status}`))
	}
	return resp.json()
}

function persist(adapter, channel, msg) {
	const validatorMsgCol = db.getMongo().collection('validatorMessages')
	return validatorMsgCol.insertOne({
		channelId: channel.id,
		from: adapter.whoami(),
		received: new Date(),
		msg
	})
}

// receivers are the receiving validators
async function persistAndPropagate(adapter, receivers, channel, msg) {
	logPropagate(receivers, channel, msg)

	await persist(adapter, channel, msg)
	return Promise.all(
		receivers.map(function(receiver) {
			return propagate(adapter, receiver, channel, msg).catch(function(e) {
				console.error(
					`validatorWorker: Unable to propagate ${msg.type} to ${receiver.id}: ${e.message || e}`
				)
			})
		})
	)
}

function logPropagate(receivers, channel, msg) {
	console.log(
		`validatorWorker: channel ${channel.id}: propagating ${msg.type} to ${
			receivers.length
		} validators`
	)
}

module.exports = { persistAndPropagate, persist, propagate }
