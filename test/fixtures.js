const cfg = {
	CREATORS_WHITELIST: null,
	MINIMAL_DEPOSIT: 1000,
	TOKEN_ADDRESS_WHITELIST: ['0x0e6BFF21862858a289AB214009d572b4079C8515'],
	VALIDATORS_WHITELIST: ['0xa95743F561db3618D204C9a7c3ca55cDf0625107']
}
const validUntil = Math.floor(Date.now()/1000) + 24 * 60 * 60 * 1000
module.exports = {
	createChannel: [
		[
			{
				id: 'awesomeChannel',
				depositAsset: 'DAI',
				depositAmount: 900,
				creator: 'awesomeCreator',
				validUntil,
				spec: {
					validators: [
						{
							id: '0x33E5DE6DBABA764d888b8aec7cf368606cde8353',
							url: 'http://localhost:8005',
							fee: 100
						},
						{
							id: '0x8A63b2a4AE1A8c3768d020E464B5a83461C260f2',
							url: 'http://localhost:8006',
							fee: 100
						}
					]
				}
			},
			{
				...cfg
			},
			`ValidationError: child "depositAsset" fails because ["depositAsset" must be one of [0x0e6BFF21862858a289AB214009d572b4079C8515]]`
		],
		[
			{
				id: 'awesomeTestChannel'
			},
			{
				...cfg
			},
			`ValidationError: child "depositAsset" fails because ["depositAsset" is required]`
		],
		[
			{
				depositAsset: 'DAI',
				depositAmount: 1000,
				creator: 'awesomeCreator',
				validUntil,
				spec: {
					validators: [
						{ id: 'awesomeLeader', url: 'http://localhost:8005' },
						{ id: 'awesomeFollower', url: 'http://localhost:8006' }
					]
				}
			},
			{
				...cfg
			},
			`ValidationError: child "id" fails because ["id" is required]`
		],
		[
			{
				id: 'test',
				depositAsset: '0x0e6BFF21862858a289AB214009d572b4079C8515',
				depositAmount: 1000,
				creator: 8,
				validUntil,
				spec: {
					validators: [
						{ id: 'awesomeLeader', url: 'http://localhost:8005' },
						{ id: 'awesomeFollower', url: 'http://localhost:8006' }
					]
				}
			},
			{
				...cfg
			},
			`ValidationError: child "creator" fails because ["creator" must be a string]`
		],
		[
			{
				id: 'awesomeChannelTest',
				depositAsset: '0x0e6BFF21862858a289AB214009d572b4079C8515',
				depositAmount: 1000,
				creator: 'awesomeCreator',
				validUntil,
				spec: {
					validators: [
						{
							id: '0xa95743F561db3618D204C9a7c3ca55cDf0625107',
							url: 'http://localhost:8005',
							fee: 100
						},
						{
							id: '0x8A63b2a4AE1A8c3768d020E464B5a83461C260f2',
							url: 'http://localhost:8006',
							fee: 100
						}
					]
				}
			},
			{
				...cfg,
				VALIDATORS_WHITELIST: []
			},
			null
		],
		[
			{
				id: 'awesomeChannelTest',
				depositAsset: '0x0e6BFF21862858a289AB214009d572b4079C8515',
				depositAmount: 1000,
				creator: 'awesomeCreator',
				validUntil,
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
			{
				...cfg
			},
			`ValidationError: child "spec" fails because [child "validators" fails because ["validators" must contain 2 items]]`
		],
		[
			{
				id: 'awesomeChannelTest',
				depositAsset: '0x0e6BFF21862858a289AB214009d572b4079C8515',
				depositAmount: 1000,
				validUntil,
				creator: 'awesomeCreator'
			},
			{
				...cfg
			},
			`ValidationError: child "spec" fails because ["spec" is required]`
		],
		[
			{
				id: 'awesomeChannelTest',
				depositAsset: '0x0e6BFF21862858a289AB214009d572b4079C8515',
				depositAmount: 1000,
				creator: 'awesomeCreator',
				validUntil,
				spec: {
					validators: [
						{
							id: '0x0e6BFF21862858a289AB214009d572b4079C8515',
							url: 'http://localhost:8005',
							fee: 100
						},
						{
							id: '0x8A63b2a4AE1A8c3768d020E464B5a83461C260f2',
							url: 'http://localhost:8006',
							fee: 100
						}
					]
				}
			},
			{
				...cfg
			},
			`ValidationError: child "spec" fails because [child "validators" fails because ["validators" at position 0 fails because [child "id" fails because ["id" must be one of [0xa95743F561db3618D204C9a7c3ca55cDf0625107]]]]]`
		]
	]
}
