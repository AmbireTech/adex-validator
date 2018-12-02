# adex-validator-stack-js

Reference implementation of the [AdEx validator stack](https://github.com/adexnetwork/adex-protocol#validator-stack-platform).

Components:

* Sentry
* Validator worker
* Watcher

## Validator worker

The validator worker has two modes: `leader` and `follower`, which refer to the validator types described in [adex-protocol/OUTPACE](https://github.com/AdExNetwork/adex-protocol/blob/master/OUTPACE.md#specification).

Both of them run something we call a producer tick, which updates a state tree (stored in `channelStateTrees`) based on the events they receive - so essentially each runs their own independent accounting.

The leader will use the latest state tree to produce a `stateRoot` and sign it.

The follower will sign any new states that the leader signs, as long as they're valid and adhere to the state transition constraints. Furthermore, it will compare them to it's own latest state tree. If the leader's state tree represents significantly lower balances, the follower will mark that channel (campaign) as unhealthy (see [campaign health](https://github.com/AdExNetwork/adex-protocol#campaign-health)).

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

### Ethereum adapter

``ETH_KEYSTORE``

``ETH_PWD``


## Testing setup


### Leader

#### Sentry

```
npm start
```

#### Validator Worker

```
node bin/validatorWorker.js --adapter=dummy --dummyIdentity=awesomeLeader
```


### Follower

#### Sentry

```
DB_MONGO_NAME=adexValidatorFollower PORT=8006 npm start
```


#### Validator Worker
```
DB_MONGO_NAME=adexValidatorFollower node bin/validatorWorker.js --adapter=dummy --dummyIdentity=awesomeFollower
```
