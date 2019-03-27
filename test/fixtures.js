const cfg = {
	CREATORS_WHITELIST: null,
	TOKEN_ADDRESS_WHITELIST: null,
	MINIMAL_DEPOSIT: 1000,
	VALIDATORS_WHITELIST: ['0xa95743F561db3618D204C9a7c3ca55cDf0625107']
}
const dummyVals = require('./prep-db/mongo')

const GOERLI_TST = '0x7af963cf6d228e564e2a0aa0ddbf06210b38615d'
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
		]
	],
	validatorMessages: [
		[
			{
				messages: [
					{
						type: 'NewState',
						balances: { myAwesomePublisher: '4', anotherPublisher: '2' },
						lastEvAggr: '2019-01-31T12:43:49.319Z',
						stateRoot: '0cdf5b460367b8640a84e0b82fd5fd41d60b7fa4386f2239b3cb3d293a864951',
						signature:
							'Dummy adapter signature for 0cdf5b460367b8640a84e0b82fd5fd41d60b7fa4386f2239b3cb3d293a864951 by awesomeLeader'
					}
				]
			},
			null
		],
		[
			{
				messages: [
					{
						type: 'Heartbeat',
						timestamp: '2019-03-27T08:24:22.527Z',
						signature:
							'Dummy adapter signature for dcfe1cea1ab9689a87251c159175030f17210c76f4e0351dfa6803161b394c45 by awesomeFollower',
						stateRoot: 'dcfe1cea1ab9689a87251c159175030f17210c76f4e0351dfa6803161b394c45'
					}
				]
			},
			null
		],
		[
			{
				messages: [
					{
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
						type: 'NewState',
						balances: { test: '1' },
						stateRoot: '3d277e1c11cd858bf0033499fdc91f02f425ed2041408265eb8fbffd3bf4f7e1',
						signature:
							'Dummy adapter signature for 3d277e1c11cd858bf0033499fdc91f02f425ed2041408265eb8fbffd3bf4f7e1 by awesomeLeader'
					}
				]
			},
			null
		],
		[
			{
				messages: [
					{
						type: 'ApproveState',
						stateRoot: '3d277e1c11cd858bf0033499fdc91f02f425ed2041408265eb8fbffd3bf4f7e1',
						isHealthy: true,
						signature:
							'Dummy adapter signature for 3d277e1c11cd858bf0033499fdc91f02f425ed2041408265eb8fbffd3bf4f7e1 by awesomeFollower'
					}
				]
			},
			null
		]
	]
}
