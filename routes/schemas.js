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

const numericString = Joi.string().regex(/^\d+$/)

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
				fee: numericString.required()
			})
		)
		.required()
		.length(2)
}

module.exports = {
	createChannel: cfg => ({
		id: Joi.string().required(),
		depositAsset: depositAsset(cfg),
		depositAmount: numericString.required(),
		// UNIX timestamp; we're not using Jai.date() cause
		// we want it to be stored in MongoDB as a number
		validUntil: Joi.number().required(),
		creator: creator(cfg),
		spec: Joi.object({
			adUnits: Joi.array().items(Joi.object()),
			targeting: Joi.array().items(Joi.object()),
			validators: validators(cfg),
			withdrawPeriodStart: Joi.number().required(),
			minPerImpression: numericString.default('1'),
			maxPerImpression: numericString.default('1'),
			nonce: Joi.string(),
			created: Joi.number()
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
					.pattern(/./, numericString)
					.when('type', {
						is: ['NewState', 'Accounting'],
						then: Joi.object()
							.keys()
							.pattern(/./, numericString)
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
					.pattern(/./, numericString)
					.when('type', {
						is: 'Accounting',
						then: Joi.object()
							.keys()
							.pattern(/./, numericString)
							.required()
					}),
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
	},
	events: {
		events: Joi.array().items(
			Joi.object({
				type: Joi.string().required(),
				publisher: Joi.string()
			})
		)
	}
}
