const fetch = require('node-fetch')
const adapter = require('../../../adapter')

function propagateMsg(channel, validator, msg) {
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
	})
}

module.exports = propagateMsg
