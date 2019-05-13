# adex-validator-stack-js

Reference implementation of the [AdEx validator stack](https://github.com/adexnetwork/adex-protocol#validator-stack-platform).

Components:

* Sentry
* Validator worker

## Validator worker

The validator worker has two modes: `leader` and `follower`, which refer to the validator types described in [adex-protocol/OUTPACE](https://github.com/AdExNetwork/adex-protocol/blob/master/OUTPACE.md#specification).

Both of them run something we call a producer tick, which updates the balances (and emits an `Accounting` message) based on the events they receive - so essentially each runs their own independent accounting.

The leader will use the latest state tree to produce a `stateRoot` and sign it.

The follower will sign any new states that the leader signs, as long as they're valid and adhere to the state transition constraints. Furthermore, it will compare them to it's own latest state tree. If the leader's state tree represents significantly lower balances, the follower will mark that channel (campaign) as unhealthy (see [campaign health](https://github.com/AdExNetwork/adex-protocol#campaign-health)).

The validator worker is the only component that actually needs to access the private key used by the validator for signing. With the Ethereum adapter, both the Sentry and the validator worker need access to the keystore file (to access the address), but only the worker needs the keystore file passphrase in order to decrypt it.

The validator worker connects to the Sentry to pull the latest event aggregates and submit the resulting validator messages.

## Sentry: API

#### Do not require authentication, can be cached:

GET `/channel/list` - get a list of all channels

GET `/channel/:id/status` - get channel status, and the validator sig(s); should each node maintain all sigs? also, remaining funds in the channel and remaining funds that are not claimed on chain (useful past validUntil); AND the health, perceived by each validator

GET `/channel/:id/tree` - get the full balances tree; you can use that to generate proofs


#### Requires authentication, can be cached:

GET `/channel/:id/event-aggregates/:user` (**NOT IMPLEMENTED**)

#### Requires authentication:

POST `/channel/:id/events` - post any events related to a channel (e.g. `IMPRESSION`)

POST `/channel/:id/validator-messages` - requires that you're authenticated as a validator; post validator events (`NewState`, `ApproveState`)


## Authentication, adapters

Some methods require authenticating with a token (`Authentication: Bearer {token}`).

The exact type and format of the token is defined by the adapter, and in the case of the Ethereum adapter (`adapters/ethereum`) this is [EWT, a subset of JWT](https://github.com/ethereum/EIPs/issues/1341).

In the adapters, the `getAuthFor(validator)` method is designed to be invoked when you want to generate an authentication token to prove who you are *to the particular validator*. This matters, cause authentication tokens are supposed to be usable only for the validator you intended them for, for better protection in the case of leaks.

The `sessionFromToken(token)` is the method that will verify the token and create the session object from it.

The dummy adapter (`adapters/dummy`) is designed to ease integration testing, and works using pre-set dummy values defined in `test/prep-db/mongo.js` for authentication tokens. The `getAuthFor(validator)` method can only work with particular validator IDs, namely the hardcoded ones in the dummy values.

When posting to `/channel/:id/events`, you can be authenticated as anyone: usually, users will be sending events directly to this route through the [AdEx SDK](https://github.com/adexnetwork/adex-protocol#sdk).

When posting to `/channel/:id/validator-messages`, you need to be authenticated as one of the channel's validators


## Tests

Unit tests:

```
npm test
```

Integration tests:

```
npm run test-integration
```

Run both:

```
npm test && npm run test-integration
```

## Environment

``PORT``

``DB_MONGO_URL``

``DB_MONGO_NAME``

``REDIS_URL``

``KEYSTORE_PWD`` - applies when adapter is set to `ethereum`

``NODE_ENV`` - if set to `production`, we will load the production configuration (see `cfg/`)

## Command line arguments

Those affect the fundamental mode of operation: e.g. whether we run with the dummy adapter (for testing/development purposes) or with the Ethereum adapter.

``--adapter`` - `dummy` or `ethereum`

``--keystoreFile`` - path to JSON keystore file (Ethereum adapter)

``--dummyIdentity`` - dummy adapter identity (Dummy adapter)

``--singleTick`` - applies to the `validatorWorker` - run a single tick and exit


## Configuration files

Those hold constants that are rarely meant to be changed, for example the validator tick timeout or the address of the OUTPACE contract

see `cfg/`


## Testing setup


### Leader

#### Sentry

```
node bin/sentry --adapter=dummy --dummyIdentity=awesomeLeader
```

#### Validator Worker

```
node bin/validatorWorker.js --adapter=dummy --dummyIdentity=awesomeLeader --sentryUrl=http://localhost:8005
```


### Follower

#### Sentry

```
DB_MONGO_NAME=adexValidatorFollower PORT=8006 node bin/sentry --adapter=dummy --dummyIdentity=awesomeFollower
```


#### Validator Worker
```
node bin/validatorWorker.js --adapter=dummy --dummyIdentity=awesomeFollower --sentryUrl=http://localhost:8006
```

## Recommendation

### Linux
* build-essentials
* node v10 *

\* Do not use [Snap](https://snapcraft.io/node) to install node, as it leads to unexpected failure of some integration tests, for reasons that we haven't investigated.

## Docker

The docker setup provides a leader, follower and mongo image. 
It uses the ethereum adapter by default which requires a `keystoreFile` and env variable `KEYSTORE_PWD`

### Configuration
The docker compose file uses volumes to manage the keystore files.
Put the keystore files for the leader and follower in the `./resources/leader` and `./resources/follower`
folders respectively.

Required: You have to specify the keystore password via the `KEYSTORE_PWD` environment variable in the `docker-compose.yml` file


### Run
```sh
docker-compose up
```

Or

```
docker build --tag=adex/adex-validator
docker run --network=host --env-file .env.prod --mount type=bind,source=$(PWD)/keystore.json,target=/app/keystore.json adex/adex-validator
```
