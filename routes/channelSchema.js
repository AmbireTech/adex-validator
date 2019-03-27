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
				// @TODO validate that it can be cast to BN.js and it is not negative
				fee: Joi.string().required()
			})
		)
		.required()
		.length(2)
}
module.exports = {
	createChannel: cfg => ({
		id: Joi.string().required(),
		depositAsset: depositAsset(cfg),
		// @TODO validate that it can be cast to BN.js and it is not negative
		depositAmount: Joi.string().required(),
		// UNIX timestamp; we're not using Jai.date() cause
		// we want it to be stored in MongoDB as a number
		validUntil: Joi.number().required(),
		creator: creator(cfg),
		spec: Joi.object({
			minPerImpression: Joi.string().default('1'),
			validators: validators(cfg)
		}).required()
	}),
	validatorMessage: {
		messages: Joi.array().items(
			Joi.object({
				type: Joi.string()
					.valid(['NewState', 'ApproveState', 'Heartbeat', 'Accounting', 'RejectState'])
					.required(),
				stateRoot: Joi.string()
					.length(64)
					.when('type', {
						is: ['NewState', 'ApproveState', 'Heartbeat'],
						then: Joi.string().required()
					}),
				signature: Joi.string().when('type', {
					is: ['NewState', 'ApproveState', 'Heartbeat'],
					then: Joi.string().required()
				}),
				lastEvAggr: Joi.string()
					.isoDate()
					.when('type', {
						is: ['Accounting'],
						then: Joi.string()
							.isoDate()
							.required()
					}),
				balances: Joi.object()
					.keys()
					.pattern(/./, Joi.string())
					.when('type', {
						is: ['NewState', 'Accounting'],
						then: Joi.object()
							.keys()
							.pattern(/./, Joi.string())
							.required()
					}),
				timestamp: Joi.string()
					.isoDate()
					.when('type', {
						is: 'Heartbeat',
						then: Joi.string()
							.isoDate()
							.required()
					}),
				balancesBeforeFees: Joi.object()
					.keys()
					.pattern(/./, Joi.string())
					.when('type', {
						is: 'Accounting',
						then: Joi.object()
							.keys()
							.pattern(/./, Joi.string())
							.required()
					}),
				created: Joi.number(),
				reason: Joi.string().when('type', {
					is: 'RejectState',
					then: Joi.string().required()
				}),
				isHealthy: Joi.boolean().when('type', {
					is: 'ApproveState',
					then: Joi.boolean().required()
				})
			})
		)
	}
}
