const { Joi } = require('celebrate')
const { eventTypes } = require('../services/constants')

const numericString = Joi.string().regex(/^\d+$/)

const validatorMessage = Joi.object({
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
				.pattern(/./, numericString.required())
				.min(1)
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
				.min(1)
				.required()
		}),
	reason: Joi.string().when('type', {
		is: 'RejectState',
		then: Joi.string().required()
	}),
	isHealthy: Joi.boolean().when('type', {
		is: 'ApproveState',
		then: Joi.boolean().required()
	}),
	exhausted: Joi.boolean().when('type', {
		is: ['NewState', 'ApproveState'],
		then: Joi.boolean()
	})
})

const sentryValidatorMessage = Joi.object({
	from: Joi.string().required(),
	received: Joi.string()
		.isoDate()
		.required(),
	msg: Joi.array().items(validatorMessage)
})

const targetingRules = Joi.array().items(Joi.object())

module.exports = {
	createChannelV5_Offchain: {
		id: Joi.string().required(),
		depositAsset: Joi.string().required(),
		depositAmount: numericString.required(),
		// UNIX timestamp; we're not using Jai.date() cause
		// we want it to be stored in MongoDB as a number
		validUntil: Joi.number()
			.integer()
			.required(),
		creator: Joi.string().required(),
		spec: Joi.object({
			adUnits: Joi.array().items(Joi.object()),
			pricingBounds: Joi.object()
				.keys()
				.pattern(
					/^(IMPRESSION|CLICK)$/,
					Joi.object({ min: numericString.required(), max: numericString.required() })
				),
			eventSubmission: Joi.object({ allow: Joi.array().items(Joi.object()) }),
			nonce: Joi.string(),
			created: Joi.number(),
			activeFrom: Joi.number()
		}).required()
	},
	createChannel: {
		id: Joi.string().required(),
		depositAsset: Joi.string().required(),
		depositAssetDecimals: Joi.number.required(),
		depositAmount: numericString.required(),
		// UNIX timestamp; we're not using Jai.date() cause
		// we want it to be stored in MongoDB as a number
		validUntil: Joi.number()
			.integer()
			.required(),
		creator: Joi.string().required(),
		spec: Joi.object({
			title: Joi.string()
				.min(3)
				.max(120)
				.allow(''),
			adUnits: Joi.array().items(Joi.object()),
			targeting: Joi.array().items(Joi.object()),
			validators: Joi.array()
				.items(
					Joi.object({
						id: Joi.string().required(),
						feeAddr: Joi.string(),
						url: Joi.string()
							.uri({
								scheme: ['http', 'https']
							})
							.required(),
						fee: numericString.required()
					})
				)
				.required()
				.length(2),
			withdrawPeriodStart: Joi.number().required(),
			minTargetingScore: Joi.number()
				.integer()
				.allow(null)
				.optional(),
			minPerImpression: numericString.default('1'),
			maxPerImpression: numericString.default('1'),
			pricingBounds: Joi.object()
				.keys()
				.pattern(
					/^(IMPRESSION|CLICK)$/,
					Joi.object({ min: numericString.required(), max: numericString.required() })
				),
			eventSubmission: Joi.object({ allow: Joi.array().items(Joi.object()) }),
			nonce: Joi.string(),
			created: Joi.number(),
			activeFrom: Joi.number(),
			targetingRules
		}).required()
	},
	validatorMessage: {
		messages: Joi.array().items(validatorMessage)
	},
	events: {
		events: Joi.array().items(
			Joi.object({
				type: Joi.string()
					.valid(Object.values(eventTypes))
					.required(),
				publisher: Joi.string(),
				ref: Joi.string().allow(''),
				adUnit: Joi.string(),
				adSlot: Joi.string(),
				targetingRules: targetingRules.when('type', {
					is: eventTypes.update_targeting,
					then: Joi.required()
				})
			}).required()
		)
	},
	eventsOffchain: {
		events: Joi.array().items(
			Joi.object({
				type: Joi.string()
					.valid(Object.values(eventTypes))
					.required(),
				publisher: Joi.string(),
				ref: Joi.string().allow(''),
				adUnit: Joi.string(),
				adSlot: Joi.string(),
				ssp: Joi.string(),
				sspPublisher: Joi.string(),
				placement: Joi.string().valid(['site', 'app']),
				country: Joi.string(),
				hostname: Joi.string(),
				os: Joi.string(),
				targetingRules: targetingRules.when('type', {
					is: eventTypes.update_targeting,
					then: Joi.required()
				})
			}).required()
		)
	},
	sentry: {
		message: sentryValidatorMessage,
		lastApproved: Joi.object({
			newState: sentryValidatorMessage,
			approveState: sentryValidatorMessage
		}),
		events: Joi.array().items(
			Joi.object({
				channelId: Joi.string().required(),
				created: Joi.string()
					.isoDate()
					.required(),
				events: Joi.object()
					.keys()
					.pattern(
						/./,
						Joi.object({
							eventCounts: Joi.object()
								.keys()
								.pattern(/./, Joi.string())
								.required(),
							eventPayouts: Joi.object()
								.keys()
								.pattern(/./, Joi.string())
								.required()
						})
					)
					.required()
			}).required()
		)
	},
	eventTimeAggr: {
		eventType: Joi.string()
			.valid(['IMPRESSION', 'CLICK'])
			.default('IMPRESSION'),
		metric: Joi.string()
			.valid(['eventCounts', 'eventPayouts'])
			.default('eventCounts'),
		timeframe: Joi.string()
			.valid(['year', 'month', 'week', 'day', 'hour'])
			.default('hour'),
		start: Joi.date(),
		end: Joi.date(),
		limit: Joi.number().default(100),
		channels: Joi.string(),
		earner: Joi.string()
	}
}
