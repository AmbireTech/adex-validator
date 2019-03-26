const { Joi } = require('celebrate')

function creator({ CREATORS_WHITELIST }) {
	let schema = Joi.string().required()
	if (CREATORS_WHITELIST && CREATORS_WHITELIST.length > 0) {
		schema = schema.valid(CREATORS_WHITELIST)
	}
	return schema
}

function depositAsset({ TOKEN_ADDRESS_WHITELIST }) {
	let schema = Joi.string().required()
	if (TOKEN_ADDRESS_WHITELIST && TOKEN_ADDRESS_WHITELIST.length > 0) {
		schema = schema.valid(TOKEN_ADDRESS_WHITELIST)
	}
	return schema
}

function depositAmount({ MINIMAL_DEPOSIT }) {
	let schema = Joi.number().required()
	if (MINIMAL_DEPOSIT > 0) {
		schema = schema.min(MINIMAL_DEPOSIT)
	}
	return schema
}

function validators({ VALIDATORS_WHITELIST }) {
	return Joi.array()
		.items(
			Joi.object({
				id:
					VALIDATORS_WHITELIST && VALIDATORS_WHITELIST.length > 0
						? Joi.any().valid(VALIDATORS_WHITELIST)
						: Joi.string().required(),
				url: Joi.string()
					.uri({
						scheme: ['http', 'https']
					})
					.required(),
				fee: Joi.number().required()
			})
		)
		.required()
		.length(2)
}
module.exports = {
	createChannel: cfg => ({
		id: Joi.string().required(),
		depositAsset: depositAsset(cfg),
		depositAmount: depositAmount(cfg),
		// UNIX timestamp; we're not using Jai.date() cause
		// we want it to be stored in MongoDB as a number
		validUntil: Joi.number().required(),
		creator: creator(cfg),
		spec: Joi.object({
			validators: validators(cfg)
		}).required()
	})
}
