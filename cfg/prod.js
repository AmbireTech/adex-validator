module.exports = {
	MAX_CHANNELS: 512,
	WAIT_TIME: 40000,
	// 60000/AGGR_THROTTLE must be an integer!
	// otherwise by-minute analytics charts would look jagged cause every Nth minute will have more aggrs
	AGGR_THROTTLE: 30000,
	HEARTBEAT_TIME: 60000,
	CHANNELS_FIND_LIMIT: 512,
	EVENTS_FIND_LIMIT: 100,
	ANALYTICS_FIND_LIMIT: 500,
	ANALYTICS_FIND_LIMIT_BY_CHANNEL_SEGMENT: 100 * 25, // Market `maxChannelsEarningFrom=25`
	ANALYTICS_FIND_LIMIT_V5: 5000,
	ANALYTICS_MAXTIME_V5: 15000,
	MSGS_FIND_LIMIT: 10,
	HEALTH_THRESHOLD_PROMILLES: 970,
	HEALTH_UNSIGNABLE_PROMILLES: 770,
	PROPAGATION_TIMEOUT: 3000,
	FETCH_TIMEOUT: 10000,
	LIST_TIMEOUT: 10000,
	VALIDATOR_TICK_TIMEOUT: 10000,
	IP_RATE_LIMIT: { type: 'ip', timeframe: 7200000 },
	CREATORS_WHITELIST: [],
	MINIMAL_DEPOSIT: 0,
	MINIMAL_FEE: 0,
	TOKEN_ADDRESS_WHITELIST: [
		'0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359',
		'0x6B175474E89094C44Da98b954EedeAC495271d0F'
	],
	ETHEREUM_CORE_ADDR: '0x333420fc6a897356e69b62417cd17ff012177d2b',
	ETHEREUM_NETWORK: 'homestead',
	ETHEREUM_ADAPTER_RELAYER: 'https://relayer.adex.network',
	VALIDATORS_WHITELIST: [],
	CHANNEL_REFRESH_INTERVAL: 40000,
	MAX_CHANNEL_SPEC_BYTES_SIZE: 35000,
	admins: [
		'0x5d6A3F1AD7b124ecDFDf4841D9bB246eD5fBF04c' // Galya (for analytics)
	],
	V4_VALIDATOR_URL: 'https://jerry.adex.network'
}
