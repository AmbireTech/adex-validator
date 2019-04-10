const BN = require('bn.js')
const assert = require('assert')

async function isChannelValid(cfg, channel, address) {
	const addrEq = (a, b) => a.toLowerCase() === b.toLowerCase()
	const ourValidator = channel.spec.validators.find(({ id }) => addrEq(address, id))
	assert.ok(ourValidator, 'channel is not validated by us')

	assert.ok(channel.validUntil * 1000 > Date.now(), 'channel.validUntil has passed')

	if (cfg.VALIDATORS_WHITELIST && cfg.VALIDATORS_WHITELIST.length) {
		assert.ok(
			channel.spec.validators.every(
				({ id }) => addrEq(id, address) || cfg.VALIDATORS_WHITELIST.includes(id.toLowerCase())
			),
			'validators are not in the whitelist'
		)
	}
	if (cfg.CREATORS_WHITELIST && cfg.CREATORS_WHITELIST.length) {
		assert.ok(
			cfg.CREATORS_WHITELIST.includes(channel.creator.toLowerCase()),
			'channel.creator is not whitelisted'
		)
	}
	assert.ok(
		new BN(channel.depositAmount).gte(new BN(cfg.MINIMAL_DEPOSIT || 0)),
		'channel.depositAmount is less than MINIMAL_DEPOSIT'
	)
	assert.ok(
		new BN(ourValidator.fee).gte(new BN(cfg.MINIMAL_FEE || 0)),
		'channel validator fee is less than MINIMAL_FEE'
	)
	assert.ok(
		channel.spec.withdrawPeriodStart < channel.validUntil * 1000,
		'channel withdrawPeriodStart is invalid'
	)
}

module.exports = {
	isChannelValid
}
