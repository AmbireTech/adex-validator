const assert = require('assert')
const { persistAndPropagate } = require("./lib/propagation")

function heartbeat(adapter, channel){
	const whoami = adapter.whoami()
	const validatorIdx = channel.validators.indexOf(whoami)
	assert.ok(validatorIdx !== -1, 'validatorTick: sending heartbeat for a channel where we are not validating')
	const otherValidators = channel.spec.validators.filter(v => v.id != whoami)

	const timestamp = `${new Date().getTime() / 1000}`

	return adapter.sign(timestamp)
	.then(function(signature) {
		return persistAndPropagate(adapter, otherValidators, channel, {
			type: 'HeartBeat',
			timestamp,
			signature
		});
	})
}

module.exports = { heartbeat }
