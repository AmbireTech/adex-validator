# Configuration

| Configuration | Description  |  Default |
|--------------| --------------| ------------|
| MAX_CHANNELS | Maximum number of channels a validator can work on | 512
| WAIT_TIME | The time interval between each validator tick  | 5000 |
| AGGR_THROTTLE | The time invertal between persisting events  | 5000 |
| HEARTBEAT_TIME | The time invertal between sending heartbeat messages | 30000 |
| CHANNELS_FIND_LIMIT | Limit on number of channels to return | 100 |
| EVENTS_FIND_LIMIT | Soft limit on number of events to return | 100 |
| MSGS_FIND_LIMIT | Limit on number of validator messages to return | 10 |
| HEALTH_THRESHOLD_PROMILLES | The margin of error allowed before a channel is marked unhealthy | 950 |
| PROPAGATION_TIMEOUT | HTTP request propagation timeout | 3000 |
| CREATORS_WHITELIST | List of accepted channel creators | [] |
| MINIMAL_DEPOSIT | Least amount a channel is required to have to be accepted by the validator | 0 |
| TOKEN_ADDRESS_WHITELIST | List of address of accepted valid payment tokens by the validator | 0 |
| VALIDATORS_WHITELIST | List of accepted possible channel validators  | [] |