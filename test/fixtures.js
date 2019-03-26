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
							fee: 0
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
	]
}
