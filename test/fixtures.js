const cfg = {
	CREATORS_WHITELIST: null,
	TOKEN_ADDRESS_WHITELIST: null,
	MINIMAL_DEPOSIT: 1000,
	VALIDATORS_WHITELIST: ['0xa95743F561db3618D204C9a7c3ca55cDf0625107']
}
const dummyVals = require('./prep-db/mongo')

const GOERLI_TST = '0x7af963cf6d228e564e2a0aa0ddbf06210b38615d'
const validatorMessage = {
	type: 'NewState',
	stateRoot: '0cdf5b460367b8640a84e0b82fd5fd41d60b7fa4386f2239b3cb3d293a864951',
	signature:
		'Dummy adapter signature for 0cdf5b460367b8640a84e0b82fd5fd41d60b7fa4386f2239b3cb3d293a864951 by awesomeLeader'
}

module.exports = {
	createChannel: [
		[
			{
				...dummyVals.channel,
				depositAsset: 'something'
			},
			{
				...cfg,
				TOKEN_ADDRESS_WHITELIST: [GOERLI_TST]
			},
			`ValidationError: child "depositAsset" fails because ["depositAsset" must be one of [${GOERLI_TST}]]`
		],
		[
			{
				id: 'awesomeTestChannel'
			},
			cfg,
			`ValidationError: child "depositAsset" fails because ["depositAsset" is required]`
		],
		[
			{
				...dummyVals.channel,
				id: undefined
			},
			cfg,
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
			{
				...cfg,
				VALIDATORS_WHITELIST: null
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
			cfg,
			'ValidationError: child "spec" fails because [child "validators" fails because ["validators" at position 0 fails because [child "fee" fails because ["fee" with value "-100" fails to match the required pattern: /^\\d+$/]]]]'
		],
		[
			{
				...dummyVals.channel,
				creator: 8
			},
			cfg,
			`ValidationError: child "creator" fails because ["creator" must be a string]`
		],
		[
			{
				...dummyVals.channel
			},
			{
				...cfg,
				VALIDATORS_WHITELIST: null
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
			cfg,
			`ValidationError: child "spec" fails because [child "validators" fails because ["validators" must contain 2 items]]`
		],
		[
			{
				...dummyVals.channel,
				spec: undefined
			},
			cfg,
			`ValidationError: child "spec" fails because ["spec" is required]`
		],
		[
			{
				...dummyVals.channel
			},
			cfg,
			`ValidationError: child "spec" fails because [child "validators" fails because ["validators" at position 0 fails because [child "id" fails because ["id" must be one of [0xa95743F561db3618D204C9a7c3ca55cDf0625107]]]]]`
		],
		// correct adunit spec
		[
			{
				...dummyVals.channel,
				spec: {
					...dummyVals.channel.spec
				}
			},
			{
				...cfg,
				VALIDATORS_WHITELIST: null
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
	]
}
