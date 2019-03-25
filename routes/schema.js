const { Joi } = require('celebrate')

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

function creator({ CREATORS_WHITELIST }) {
	let schema = Joi.array()
		.items(Joi.string())
		.required()
		.length(2)
	if (CREATORS_WHITELIST && CREATORS_WHITELIST.length > 0) {
		schema = schema.has(CREATORS_WHITELIST)
	}
	return schema
}

function validators({ VALIDATORS_WHITELIST }) {
	let schema = Joi.array().items(
		Joi.object({
			id: Joi.string().required(),
			url: Joi.string()
				.uri({
					scheme: ['http', 'https']
				})
				.required(),
			fee: Joi.number().required()
		})
	)

	if (VALIDATORS_WHITELIST && VALIDATORS_WHITELIST.length > 0) {
		schema = schema.has(
			Joi.object({
				id: Joi.any().valid(VALIDATORS_WHITELIST),
				url: Joi.string()
					.uri({
						scheme: ['http', 'https']
					})
					.required(),
				fee: Joi.number().required()
			})
		)
	}

	return schema.length(2)
}
module.exports = {
	createChannel: cfg => ({
		id: Joi.string().required(),
		depositAsset: depositAsset(cfg),
		depositAmount: depositAmount(cfg),
		validators: creator(cfg),
		spec: Joi.object({
			validators: validators(cfg)
		}),
		watcher: Joi.object({
			ethereum: Joi.object({
				// contract address should be in format 0x...
				contract: Joi.string()
					.required()
					.length(42)
			})
		}).required()
	})
}
