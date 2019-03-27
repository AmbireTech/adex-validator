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
| HEALTH_THRESHOLD_PROMILLES | The margin of error allowed before a channel is marked unhealthy | 950 |
| PROPAGATION_TIMEOUT | HTTP request propagation timeout | 3000 |
| CREATORS_WHITELIST | List of accepted channel creators; leave empty for all | [] |
| MINIMAL_DEPOSIT | Least amount a channel is required to have to be accepted | 0 |
| TOKEN_ADDRESS_WHITELIST | List of valid payment tokens address; leave empty for all | [] |
| ETHEREUM_CORE_ADDR | On chain contract address   | 0x333420fc6a897356e69b62417cd17ff012177d2b |
| ETHEREUM_NETWORK | Ethereum network id | homestead |,
| VALIDATORS_WHITELIST | List of accepted channel validators; leave empty for all | [] |
