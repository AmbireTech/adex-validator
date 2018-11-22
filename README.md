# adex-validator-stack-js

Reference implementation of the [AdEx validator stack](https://github.com/adexnetwork/adex-protocol#validator-stack-platform).

Components:

* Sentry
* Validator worker
* Watcher

## API


#### Do not require authentication, can be cached:

GET `/channel/:id/status` - get channel status, and the validator sig(s); should each node maintain all sigs? also, remaining funds in the channel and remaining funds that are not claimed on chain (useful past validUntil); AND the health, perceived by each validator

GET `/channel/:id/tree` - get the full balances tree; you can use that to generate proofs

GET `/channel/list`

#### Requires authentication, can be cached:

GET `/channel/:id/events/:user`

#### Requires authentication:

POST `/channel/events`

POST `/channel/validator-messages`



## Environment

``PORT``

``DB_MONGO_URL``

``DB_MONGO_NAME``
