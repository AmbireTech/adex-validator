module.exports = {
	MAX_CHANNELS: 512,
	WAIT_TIME: 15000,
	AGGR_THROTTLE: 5000,
	HEARTBEAT_TIME: 60000,
	CHANNELS_FIND_LIMIT: 512,
	EVENTS_FIND_LIMIT: 100,
	MSGS_FIND_LIMIT: 10,
	HEALTH_THRESHOLD_PROMILLES: 950,
	PROPAGATION_TIMEOUT: 3000,
	FETCH_TIMEOUT: 10000,
	LIST_TIMEOUT: 10000,
	VALIDATOR_TICK_TIMEOUT: 10000,
	IP_RATE_LIMIT: { type: 'ip', timeframe: 20000 },
	CREATORS_WHITELIST: [],
	MINIMAL_DEPOSIT: 0,
	MINIMAL_FEE: 0,
	TOKEN_ADDRESS_WHITELIST: ['0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359'],
	ETHEREUM_CORE_ADDR: '0x333420fc6a897356e69b62417cd17ff012177d2b',
	ETHEREUM_NETWORK: 'homestead',
	VALIDATORS_WHITELIST: []
}
