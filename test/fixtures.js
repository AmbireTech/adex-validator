const BN = require('bn.js')
const dummyVals = require('./prep-db/mongo')

const validatorMessage = {
	type: 'NewState',
	stateRoot: '0cdf5b460367b8640a84e0b82fd5fd41d60b7fa4386f2239b3cb3d293a864951',
	signature:
		'Dummy adapter signature for 0cdf5b460367b8640a84e0b82fd5fd41d60b7fa4386f2239b3cb3d293a864951 by awesomeLeader',
	balances: { myAwesomePublisher: '214000000000000000000000', anotherPublisher: '2' }
}

const payoutChannel = {
	depositAmount: '100',
	spec: {
		minPerImpression: '8',
		maxPerImpression: '64',
		pricingBounds: { CLICK: { min: new BN(23), max: new BN(100) } }
	}
}

module.exports = {
	createChannel: [
		[
			{
				id: 'awesomeTestChannel'
			},
			`ValidationError: child "depositAsset" fails because ["depositAsset" is required]`
		],
		[
			{
				...dummyVals.channel,
				id: undefined
			},
			`ValidationError: child "id" fails because ["id" is required]`
		],
		[
			{
				...dummyVals.channel,
				spec: {
					...dummyVals.channel.spec,
					minPerImpression: '1acb'
				}
			},
			'ValidationError: child "spec" fails because [child "minPerImpression" fails because ["minPerImpression" with value "1acb" fails to match the required pattern: /^\\d+$/]]'
		],
		[
			{
				...dummyVals.channel,
				spec: {
					minPerImpression: '1',
					validators: [
						{
							id: '0xa95743F561db3618D204C9a7c3ca55cDf0625107',
							url: 'http://localhost:8005',
							fee: '-100'
						},
						{
							id: '0xa95743F561db3618D204C9a7c3ca55cDf0625107',
							url: 'http://localhost:8006',
							fee: '100'
						}
					]
				}
			},
			'ValidationError: child "spec" fails because [child "validators" fails because ["validators" at position 0 fails because [child "fee" fails because ["fee" with value "-100" fails to match the required pattern: /^\\d+$/]]]]'
		],
		[
			{
				...dummyVals.channel,
				creator: 8
			},
			`ValidationError: child "creator" fails because ["creator" must be a string]`
		],
		[
			{
				...dummyVals.channel
			},
			null
		],
		[
			{
				...dummyVals.channel,
				spec: {
					validators: [
						{
							id: '0xa95743F561db3618D204C9a7c3ca55cDf0625107',
							url: 'http://localhost:8005',
							fee: '0'
						}
					]
				}
			},
			`ValidationError: child "spec" fails because [child "validators" fails because ["validators" must contain 2 items]]`
		],
		[
			{
				...dummyVals.channel,
				spec: undefined
			},
			`ValidationError: child "spec" fails because ["spec" is required]`
		],
		// correct adunit spec
		[
			{
				...dummyVals.channel,
				spec: {
					...dummyVals.channel.spec
				}
			},
			null
		]
	],
	validatorMessages: [
		[
			{
				messages: [
					{
						...validatorMessage,
						balances: { myAwesomePublisher: '214000000000000000000000', anotherPublisher: '2' }
					}
				]
			},
			null
		],
		// incorrect big number
		[
			{
				messages: [
					{
						...validatorMessage,
						balances: { myAwesomePublisher: '4000abc', anotherPublisher: '4' }
					}
				]
			},
			'ValidationError: child "messages" fails because ["messages" at position 0 fails because [child "balances" fails because [child "myAwesomePublisher" fails because ["myAwesomePublisher" with value "4000abc" fails to match the required pattern: /^\\d+$/]]]]'
		],
		// negative amount
		[
			{
				messages: [
					{
						...validatorMessage,
						balances: { myAwesomePublisher: '-4000000', anotherPublisher: '4' }
					}
				]
			},
			'ValidationError: child "messages" fails because ["messages" at position 0 fails because [child "balances" fails because [child "myAwesomePublisher" fails because ["myAwesomePublisher" with value "-4000000" fails to match the required pattern: /^\\d+$/]]]]'
		],
		[
			{
				messages: [
					{
						...validatorMessage,
						balances: { myAwesomePublisher: 4, anotherPublisher: '2' }
					}
				]
			},
			'ValidationError: child "messages" fails because ["messages" at position 0 fails because [child "balances" fails because [child "myAwesomePublisher" fails because ["myAwesomePublisher" must be a string]]]]'
		],
		[
			{
				messages: [
					{
						...validatorMessage,
						type: 'Heartbeat',
						timestamp: '2019-03-27T08:24:22.527Z'
					}
				]
			},
			null
		],
		[
			{
				messages: [
					{
						...validatorMessage,
						type: 'Heartbeat'
					}
				]
			},
			'ValidationError: child "messages" fails because ["messages" at position 0 fails because [child "timestamp" fails because ["timestamp" is required]]]'
		],
		[
			{
				messages: [
					{
						...validatorMessage,
						type: 'Accounting',
						balancesBeforeFees: { test: '1' },
						balances: { test: '1' },
						lastEvAggr: '2019-03-27T08:31:49.597Z'
					}
				]
			},
			null
		],
		[
			{
				messages: [
					{
						type: 'RejectState',
						reason: 'wrong signature (InvalidSignature)'
					}
				]
			},
			null
		],
		[
			{
				messages: [
					{
						...validatorMessage,
						type: 'ApproveState',
						isHealthy: true
					}
				]
			},
			null
		],
		[
			{
				messages: [
					{
						...validatorMessage,
						type: 'ApproveState'
					}
				]
			},
			'ValidationError: child "messages" fails because ["messages" at position 0 fails because [child "isHealthy" fails because ["isHealthy" is required]]]'
		]
	],
	invalidChannels: validChannel => [
		[
			// invalidChannelValidatorsChecksum
			{
				...validChannel,
				spec: {
					...validChannel.spec,
					validators: [
						// keystore json address
						{
							id: '0x2bdeafae53940669daa6f519373f686c1f3d3393',
							url: 'http://localhost:8005',
							fee: '100'
						},
						{
							id: '0x2bdeafae53940669daa6f519373f686c1f3d3393',
							url: 'http://localhost:8006',
							fee: '100'
						}
					]
				}
			},
			{},
			'channel.validators: all addresses are checksummed'
		],
		[
			// invalidChannel channel.depositAsset is not whitelisted
			{
				...validChannel
			},
			{
				TOKEN_ADDRESS_WHITELIST: ['0x']
			},
			'channel.depositAsset is not whitelisted'
		],
		[
			// invalidChannelNotValidatedByUs
			{
				...validChannel,
				spec: {
					...validChannel.spec,
					validators: [
						// keystore json address
						{
							id: '0x6704Fbfcd5Ef766B287262fA2281C105d57246a6',
							url: 'http://localhost:8005',
							fee: '100'
						},
						{
							id: '0x6704Fbfcd5Ef766B287262fA2281C105d57246a6',
							url: 'http://localhost:8006',
							fee: '100'
						}
					]
				}
			},
			{},
			'channel is not validated by us'
		],
		[
			// invalidChannel validators are not in the whitelist
			{
				...validChannel
			},
			{
				VALIDATORS_WHITELIST: ['0x']
			},
			'validators are not in the whitelist'
		],
		[
			// invalidChannel channel.creator is not whitelisted
			{
				...validChannel
			},
			{
				CREATORS_WHITELIST: ['0x']
			},
			'channel.creator is not whitelisted'
		],
		[
			// invalidChannel channel.depositAmount is less than MINIMAL_DEPOSIT
			{
				...validChannel
			},
			{
				MINIMAL_DEPOSIT: 100000000
			},
			'channel.depositAmount is less than MINIMAL_DEPOSIT'
		],
		[
			// invalidChannel channel.depositAmount is less than MINIMAL_FEE
			{
				...validChannel
			},
			{
				MINIMAL_FEE: 100000000
			},
			'channel validator fee is less than MINIMAL_FEE'
		]
	],
	sentry: {
		message: [
			[
				{
					from: '0x',
					received: new Date().toISOString(),
					msg: [
						{
							...validatorMessage
						}
					]
				},
				null
			],
			[
				{
					from: '0x',
					received: new Date().toISOString(),
					msg: []
				},
				null
			],
			[
				{
					received: new Date().toISOString(),
					msg: []
				},
				'ValidationError: child "from" fails because ["from" is required]'
			]
		],
		lastApproved: [
			[
				{
					newState: {
						from: '0x1',
						received: new Date().toISOString(),
						msg: [
							{
								...validatorMessage
							}
						]
					},
					approveState: {
						from: '0x1',
						received: new Date().toISOString(),
						msg: [
							{
								...validatorMessage
							}
						]
					}
				},
				null
			]
		],
		events: [
			[
				[
					{
						channelId: 'test',
						created: new Date().toISOString(),
						events: {
							IMPRESSION: {
								eventCounts: {
									awesomePublisher: '1'
								},
								eventPayouts: {
									awesomePublisher: '1'
								}
							}
						}
					}
				],
				null
			],
			[
				[
					{
						created: new Date().toISOString(),
						events: {
							IMPRESSION: {
								eventCounts: {
									awesomePublisher: '1'
								},
								eventPayouts: {
									awesomePublisher: '1'
								}
							}
						}
					}
				],
				`ValidationError: "value" at position 0 fails because [child "channelId" fails because ["channelId" is required]]`
			]
		]
	},
	payoutRules: [
		[
			{
				depositAmount: '100',
				spec: {
					minPerImpression: '8',
					maxPerImpression: '64',
					pricingBounds: { CLICK: { min: new BN(23), max: new BN(100) } }
				}
			},
			{ publisher: '0xce07CbB7e054514D590a0262C93070D838bFBA2e', type: 'IMPRESSION' },
			{},
			['0xce07cbb7e054514d590a0262c93070d838bfba2e', new BN(8)],
			`pricingBounds: impression event`
		],
		[
			{
				depositAmount: '100',
				spec: {
					minPerImpression: '8',
					maxPerImpression: '64',
					pricingBounds: { CLICK: { min: new BN(23), max: new BN(100) } }
				}
			},
			{ publisher: '0xce07CbB7e054514D590a0262C93070D838bFBA2e', type: 'CLICK' },
			{},
			['0xce07cbb7e054514d590a0262c93070d838bfba2e', new BN(23)],
			`pricingBounds: click event`
		],
		[
			{
				depositAmount: '100',
				spec: {
					minPerImpression: '8',
					maxPerImpression: '64',
					pricingBounds: { CLICK: { min: new BN(23), max: new BN(100) } }
				}
			},
			{ type: 'CLOSE' },
			{},
			null,
			`pricingBounds: close event `
		],
		[
			{
				...payoutChannel,
				spec: {
					...payoutChannel.spec,
					priceMultiplicationRules: [{ amount: '10', country: ['us'], eventType: ['click'] }]
				}
			},
			{ publisher: '0xce07CbB7e054514D590a0262C93070D838bFBA2e', type: 'IMPRESSION' },
			{},
			['0xce07cbb7e054514d590a0262c93070d838bfba2e', new BN(8)],
			`fixedAmount: impression`
		],
		[
			{
				...payoutChannel,
				spec: {
					...payoutChannel.spec,
					priceMultiplicationRules: [{ amount: '10', country: ['us'], eventType: ['click'] }]
				}
			},
			{ publisher: '0xce07CbB7e054514D590a0262C93070D838bFBA2e', type: 'CLICK' },
			{ country: 'US' },
			['0xce07cbb7e054514d590a0262c93070d838bfba2e', new BN(10)],
			`fixedAmount (country, publisher): click`
		],
		[
			{
				...payoutChannel,
				spec: {
					...payoutChannel.spec,
					priceMultiplicationRules: [{ amount: '10' }]
				}
			},
			{ publisher: '0xce07CbB7e054514D590a0262C93070D838bFBA2e', type: 'CLICK' },
			{ country: 'US' },
			['0xce07cbb7e054514d590a0262c93070d838bfba2e', new BN(10)],
			`fixedAmount (all): click`
		],
		[
			{
				...payoutChannel,
				spec: {
					...payoutChannel.spec,
					priceMultiplicationRules: [{ amount: '10000' }]
				}
			},
			{ publisher: '0xce07cbb7e054514d590a0262c93070d838bfba2e', type: 'IMPRESSION' },
			{},
			['0xce07cbb7e054514d590a0262c93070d838bfba2e', new BN(64)],
			`fixedAmount (all): price should not exceed maxPerImpressionPrice`
		],
		[
			{
				...payoutChannel,
				spec: {
					...payoutChannel.spec,
					priceMultiplicationRules: [{ amount: '10000' }]
				}
			},
			{ publisher: '0xce07cbb7e054514d590a0262c93070d838bfba2e', type: 'CLICK' },
			{ country: 'US' },
			['0xce07cbb7e054514d590a0262c93070d838bfba2e', new BN(100)],
			`fixedAmount (all): price should not exceed event pricingBound max`
		],
		[
			{
				...payoutChannel,
				spec: {
					...payoutChannel.spec,
					priceMultiplicationRules: [
						{ amount: '10', country: ['us'], eventType: ['click'] },
						{
							amount: '12',
							country: ['us'],
							eventType: ['click'],
							publisher: ['0xce07CbB7e054514D590a0262C93070D838bFBA2e']
						}
					]
				}
			},
			{ publisher: '0xce07CbB7e054514D590a0262C93070D838bFBA2e', type: 'CLICK' },
			{ country: 'US' },
			['0xce07cbb7e054514d590a0262c93070d838bfba2e', new BN(10)],
			`fixedAmount (country, pulisher): should choose first fixedAmount rule`
		],
		[
			{
				...payoutChannel,
				spec: {
					...payoutChannel.spec,
					priceMultiplicationRules: [
						{
							amount: '15',
							country: ['us'],
							eventType: ['click'],
							publisher: ['0xce07CbB7e054514D590a0262C93070D838bFBA2e'],
							osType: ['android']
						}
					]
				}
			},
			{
				publisher: '0xce07CbB7e054514D590a0262C93070D838bFBA2e',
				type: 'CLICK'
			},
			{ country: 'US', osType: 'android' },
			['0xce07cbb7e054514d590a0262c93070d838bfba2e', new BN(15)],
			`fixedAmount (country, pulisher, osType): click`
		],
		[
			{
				...payoutChannel,
				spec: {
					...payoutChannel.spec,
					priceMultiplicationRules: [
						{
							multiplier: 1.2,
							country: ['us'],
							eventType: ['click'],
							publisher: ['0xce07CbB7e054514D590a0262C93070D838bFBA2e'],
							osType: ['android']
						},
						{
							amount: '12',
							country: ['us'],
							eventType: ['click'],
							publisher: ['0xce07CbB7e054514D590a0262C93070D838bFBA2e'],
							osType: ['android']
						}
					]
				}
			},
			{
				publisher: '0xce07CbB7e054514D590a0262C93070D838bFBA2e',
				type: 'CLICK'
			},
			{ country: 'US', osType: 'android' },
			['0xce07cbb7e054514d590a0262c93070d838bfba2e', new BN(12)],
			`fixedAmount (country, osType, publisher): choose fixedAmount rule over multiplier if present`
		],
		[
			{
				...payoutChannel,
				spec: {
					...payoutChannel.spec,
					pricingBounds: {
						CLICK: {
							min: new BN((1e18).toString()).toString(),
							max: new BN((100e18).toString()).toString()
						}
					},
					priceMultiplicationRules: [
						{
							multiplier: 1.2,
							country: ['us'],
							eventType: ['click'],
							publisher: ['0xce07CbB7e054514D590a0262C93070D838bFBA2e'],
							osType: ['android']
						},
						{
							multiplier: 1.2
						}
					]
				}
			},
			{
				publisher: '0xce07CbB7e054514D590a0262C93070D838bFBA2e',
				type: 'CLICK'
			},
			{ country: 'US', osType: 'android' },
			['0xce07cbb7e054514d590a0262c93070d838bfba2e', new BN('1440000000000000000')],
			`multiplier (country, osType, publisher | all) - apply all multiplier rules`
		]
	]
}
