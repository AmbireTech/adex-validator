# Configuration

| Configuration | Description  |  Default |
|--------------| --------------| ------------|
| MAX_CHANNELS | Maximum number of channels we are allowed to validate | 512
| WAIT_TIME | The time interval between each validator tick  | 5000 |
| AGGR_THROTTLE | The time invertal between persisting events  | 5000 |
| HEARTBEAT_TIME | The time invertal between sending heartbeat messages | 30000 |
| CHANNELS_FIND_LIMIT | Limit on number of channels to return | 100 |
| EVENTS_FIND_LIMIT | Limit on number of events to return | 100 |
| MSGS_FIND_LIMIT | Limit on number of validator messages to return | 10 |
| HEALTH_THRESHOLD_PROMILLES | Threshold of correctness allowed before a channel is marked unhealthy | dev: 950 / prod: 970 |
| HEALTH_UNSIGNABLE_PROMILLES | Threshold of correctness before a state is rejected | dev: 750 / prod: 770 |
| PROPAGATION_TIMEOUT | HTTP request propagation timeout | 3000 |
| FETCH_TIMEOUT | Validator stack request timeout | 3000 |
| LIST_TIMEOUT | Validator stack channel request timeout | 3000 |
| IP_RATE_LIMIT | Rate limit based on IP addresses | { type: 'ip', timeframe: 60000 } |
| MINIMAL_FEE | Least fee amount a validator requires to process a channel | 0 |
| CREATORS_WHITELIST | List of accepted channel creators; leave empty for all | [] |
| MINIMAL_DEPOSIT | Least amount a channel is required to have to be accepted | 0 |
| TOKEN_ADDRESS_WHITELIST | List of valid payment tokens address; leave empty for all | [] |
| VALIDATORS_WHITELIST | List of accepted channel validators; leave empty for all | [] |
| chainIdsByCoreAddr | Supported chain id to the network deployed on chain contract core addr | { '1': '0x333420fc6a897356e69b62417cd17ff012177d2b' } |
| supportedChainIdsByRPC | Map of a network chain id to the network rpc url | { '1': 'https://mainnet.infura.io/*' } |
| depositAssetsToChainId | Default fallback mapping whitelisted deposit asset to its network chain id | {'0x89d24A6b4CcB1B6fAA2625fE562bDD9a23260359': '1' } |
