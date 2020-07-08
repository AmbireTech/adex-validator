const BN = require('bn.js')
const assert = require('assert')

async function isChannelValid(cfg, channel, address) {
	const ourValidator = channel.spec.validators.find(({ id }) => address === id)
	assert.ok(ourValidator, 'channel is not validated by us')
	const inOneYear = new Date()
	inOneYear.setDate(inOneYear.getDate() + 365)

	assert.ok(channel.validUntil * 1000 > Date.now(), 'channel.validUntil has passed')
	assert.ok(
		channel.validUntil * 1000 <= inOneYear.getTime(),
		'channel.validUntil should not be greater than one year'
	)
	assert.ok(
		channel.spec.withdrawPeriodStart < channel.validUntil * 1000,
		'channel withdrawPeriodStart is invalid'
	)

	if (cfg.VALIDATORS_WHITELIST && cfg.VALIDATORS_WHITELIST.length) {
		assert.ok(
			channel.spec.validators.every(
				({ id }) => id === address || cfg.VALIDATORS_WHITELIST.includes(id.toLowerCase())
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
	if (cfg.TOKEN_ADDRESS_WHITELIST && cfg.TOKEN_ADDRESS_WHITELIST.length) {
		const depositAsset = channel.depositAsset

		assert.ok(
			cfg.TOKEN_ADDRESS_WHITELIST.some(
				id => id === depositAsset || id.toLowerCase() === depositAsset.toLowerCase()
			),
			'channel.depositAsset is not whitelisted'
		)
	}

	// we use buffer instead of string length to cater for
	// non utf8 strings
	const specByteSize = Buffer.from(JSON.stringify(channel.spec)).byteLength
	assert.ok(
		specByteSize <= cfg.MAX_CHANNEL_SPEC_BYTES_SIZE,
		`spec byte size exceeds allowed ${cfg.MAX_CHANNEL_SPEC_BYTES_SIZE} bytes size limit`
	)

	const depositAmount = new BN(channel.depositAmount)
	assert.ok(
		depositAmount.gte(new BN(cfg.MINIMAL_DEPOSIT || 0)),
		'channel.depositAmount is less than MINIMAL_DEPOSIT'
	)
	assert.ok(
		new BN(ourValidator.fee).gte(new BN(cfg.MINIMAL_FEE || 0)),
		'channel validator fee is less than MINIMAL_FEE'
	)
	const totalValidatorFee = channel.spec.validators
		.map(v => new BN(v.fee, 10))
		.reduce((a, b) => a.add(b), new BN(0))
	assert.ok(totalValidatorFee.lte(depositAmount), 'total fees <= deposit: fee constraint violated')
}

module.exports = {
	isChannelValid
}
