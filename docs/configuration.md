# Configuration

| Configuration | Description  |  Default |
|--------------| --------------| ------------|
| MAX_CHANNELS | Maximum number of channels the validator worker should process in one tick | 512
| WAIT_TIME | The time  | 5000 |
| AGGR_THROTTLE | The number of events | 5000 |
| HEARTBEAT_TIME | Invertal between sending heartbeat messaes | 30000 |
| CHANNELS_FIND_LIMIT | Limit on number of channels to return | 100 |
| EVENTS_FIND_LIMIT | Soft limit on number of events to return | 100 |
| MSGS_FIND_LIMIT | Limit on number of validator messages | 10 |
| HEALTH_THRESHOLD_PROMILLES | Health error | 950|
| PROPAGATION_TIMEOUT | | 3000 |
| CREATORS_WHITELIST | List of accepted channel creators | [] |
| MINIMAL_DEPOSIT | Least amount a channel is required to have to be accepted | 0 |
| TOKEN_ADDRESS_WHITELIST | List of address of accepted valid payment tokens  | 0 |
| VALIDATORS_WHITELIST: | List of accepted possible channel validators  | [] |