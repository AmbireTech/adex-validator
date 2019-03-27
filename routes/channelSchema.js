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
		})
	}),
	validatorMessage: {
		messages: Joi.array()
		.items(
			Joi.object({
				type: Joi.string().valid(['NewState', 'AccoutingState', 'ApproveState']).required(),
				stateRoot: Joi.string().length(64).required(),
				signature: Joi.string().required(),
				balances: Joi.object({
					
				})
			})
		)
	}
}

{ 
"type" : "NewState", 
"balances" : { "myAwesomePublisher" : "4", "anotherPublisher" : "2" }, 
"lastEvAggr" : "2019-01-31T12:43:49.319Z", 
"stateRoot" : "0cdf5b460367b8640a84e0b82fd5fd41d60b7fa4386f2239b3cb3d293a864951",
"signature" : "Dummy adapter signature for 0cdf5b460367b8640a84e0b82fd5fd41d60b7fa4386f2239b3cb3d293a864951 by awesomeLeader" }