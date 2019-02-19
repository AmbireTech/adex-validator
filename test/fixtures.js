const cfg = {
	CREATORS_WHITELIST: ['0xa95743F561db3618D204C9a7c3ca55cDf0625107'],
	MINIMAL_DEPOSIT: 1000,
	TOKEN_ADDRESS_WHITELIST: ['0x0e6BFF21862858a289AB214009d572b4079C8515']
}

module.exports = {
    createCampaign: [
		[
			{
				id: 'awesomeChannel',
				depositAsset: 'DAI',
				depositAmount: 900,
				validators: ['0x33E5DE6DBABA764d888b8aec7cf368606cde8353', '0x8A63b2a4AE1A8c3768d020E464B5a83461C260f2'],
				spec: {
					validators: [
						{ id: '0x33E5DE6DBABA764d888b8aec7cf368606cde8353', url: 'http://localhost:8005', fee: 100 },
						{ id: '0x8A63b2a4AE1A8c3768d020E464B5a83461C260f2', url: 'http://localhost:8006', fee: 100 },
					]
				}
			},
			{
				...cfg,
				CREATORS_WHITELIST: ['0x33E5DE6DBABA764d888b8aec7cf368606cde8353'],
			},
			`ValidationError: child "depositAsset" fails because ["depositAsset" must be one of [0x0e6BFF21862858a289AB214009d572b4079C8515]]`
		],
		[
			{
				id: 'awesomeTestChannel'
			},
			{
				...cfg,
			},
			`ValidationError: child "depositAsset" fails because ["depositAsset" is required]`
		],
		[
			{
				depositAsset: 'DAI',
				depositAmount: 1000,
				validators: ['awesomeFollower'],
				spec: {
					validators: [
						{ id: 'awesomeLeader', url: 'http://localhost:8005'},
						{ id: 'awesomeFollower', url: 'http://localhost:8006'},
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
                id: 'awesomeChannelTest',
				depositAsset: '0x0e6BFF21862858a289AB214009d572b4079C8515',
				depositAmount: 1000,
				validators: ['0xa95743F561db3618D204C9a7c3ca55cDf0625107', '0x8A63b2a4AE1A8c3768d020E464B5a83461C260f2'],
				spec: {
					validators: [
						{ id: '0x33E5DE6DBABA764d888b8aec7cf368606cde8353', url: 'http://localhost:8005', 'fee': 100 },
						{ id: '0x8A63b2a4AE1A8c3768d020E464B5a83461C260f2', url: 'http://localhost:8006', 'fee': 100 },
					]
				}
			},
			{
				...cfg
			},
			null
		]
    ],
    validateCampaign: [
        [
            {
                id: 'awesomeChannelTest',
                depositAsset: '0x0e6BFF21862858a289AB214009d572b4079C8515',
                depositAmount: 1000,
                validators: [],
                role: "testing",
                spec: {
                    validators: [
                        { id: '0x33E5DE6DBABA764d888b8aec7cf368606cde8353', url: 'http://localhost:8005', 'fee': 100 },
                        { id: '0x8A63b2a4AE1A8c3768d020E464B5a83461C260f2', url: 'http://localhost:8006', 'fee': 100 },
                    ]
                }
            },
			{
				...cfg,
			},
			`ValidationError: child "role" fails because ["role" must be one of [leader, follower]]`
        ],
        [
            {
                id: 'awesomeChannelTest',
                depositAsset: '0x0e6BFF21862858a289AB214009d572b4079C8515',
                depositAmount: 1000,
                validators: [],
                role: "leader",
                spec: {
                    validators: [
                        { id: '0x33E5DE6DBABA764d888b8aec7cf368606cde8353', url: 'http://localhost:8005', 'fee': 100 },
                        { id: '0x8A63b2a4AE1A8c3768d020E464B5a83461C260f2', url: 'http://localhost:8006', 'fee': 100 },
                    ]
                }
            },
            {
                ...cfg
            },
            null
        ]
    ]
}