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

function validatorsShort({ VALIDATORS_WHITELIST }) {
	let schema = Joi.array()
		.items(Joi.string())
		.required()
		.length(2)
	if (VALIDATORS_WHITELIST && VALIDATORS_WHITELIST.length > 0) {
		schema = schema.has(VALIDATORS_WHITELIST)
	}
	return schema
}

function validators({ VALIDATORS_WHITELIST }) {
	const schema = Joi.array()
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

	return schema.length(2)
}
module.exports = {
	createChannel: cfg => ({
		id: Joi.string().required(),
		depositAsset: depositAsset(cfg),
		depositAmount: depositAmount(cfg),
		creator: Joi.string().required(),
		validators: validatorsShort(cfg),
		spec: Joi.object({
			validators: validators(cfg)
		})
	})
}
