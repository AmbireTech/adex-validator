# adex-validator

Reference implementation of the [AdEx validator stack](https://github.com/adexnetwork/adex-protocol#validator-stack-platform), in JavaScript (nodeJS).

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


### Address convention

All addresses in the `channel.spec` are serialized as checksummed.

All addresses in the balance trees are lowercased.

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

Using JS validator worker
```
npm run test-integration
```

Using Rust validator worker

```sh
RUST_VALIDATOR_WORKER=[path to validator_worker binary] npm run test-integration
```

e.g.

```sh
RUST_VALIDATOR_WORKER=./adex-validator-stack-rust/target/debug/validator_worker npm run test-integration
```

It is also recommended to run with `RUST_ONLY_RUN`, to test interoperability with the JS worker:
```sh
RUST_VALIDATOR_WORKER=./adex-validator-stack-rust/target/debug/validator_worker RUST_ONLY_RUN=leader npm run test-integration
RUST_VALIDATOR_WORKER=./adex-validator-stack-rust/target/debug/validator_worker RUST_ONLY_RUN=follower npm run test-integration
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

``ANALYTICS_RECORDER`` - if set to anything, we'll collect analytical reports as per [AIP 23](https://github.com/AdExNetwork/aips/issues/23)

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

Required: You have to specify the keystore password via the `KEYSTORE_PWD` environment variable in a `validator.env` file, which wil be used by `docker-compose.yml`


### Run

```sh
docker-compose up
```

Or, to start the Sentry only

```
docker build --tag=adex/adex-validator
docker run --network=host --env-file .env.prod --mount type=bind,source=$(PWD)/keystore.json,target=/app/keystore.json adex/adex-validator
```

### Pruning

Run `./scripts/prune.js` to prune old validator messages.

This script only prunes validator messages for select channels or all expired channels. It keeps `eventAggregates` for historical purposes.

### Benchmark

#### Install Wrk2

Details to install wrk2 can be found here on either Linux or Mac OSX

* Linux

https://github.com/giltene/wrk2/wiki/Installing-wrk2-on-Linux

* Mac OSX

https://github.com/giltene/wrk2/wiki/Installing-wrk2-on-Mac

#### Running Benchmark

* Bare Metal

```sh

npm run benchmark

```

* Docker

```sh

> docker-compose up
> npm run benchmark-docker

```

### Reward distribution

Distributes the earned validator fees to a validator pool. Currently set to the Validator Tom pool (see the hardcodes in `scripts/distribute-rewards.js`).

Example:

```
NODE_ENV=production KEYSTORE_PWD=<pwd> node scripts/distribute-rewards.js ./keystore.json
 ```

Regarding the incentives [announced in August 2020](https://www.adex.network/blog/new-token-economics-and-staking/), they're distributed with an equivalent script:

```
NODE_ENV=production KEYSTORE_PWD=<pwd> node scripts/distribute-incentives.js ./keystore.json
 ```

#### Warning for implementing reward distribution

Rules for distributing rewards: payment channels must be valid for one year, rewards must be distributed for up to 6 month periods to allow for 6 months claim time.


#### Export Data to Biquery

To run the BigQuery export script e.g.

```sh

> export GOOGLE_APPLICATION_CREDENTIALS="[PATH]"
> export GOOGLE_CLOUD_PROJECT="[ID]" (default = 'adex-275614')
> export DATASET_NAME="[DATASET]" (default = 'adex')
> ./scripts/export-analytics.js

```

## LICENSE

This project is licensed under the [AGPL-3.0 license](./LICENSE)