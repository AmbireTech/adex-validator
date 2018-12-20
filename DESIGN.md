## Stack

NodeJS 10 + MongoDB

## Status

Reference implementation

## Colletions

sessions
eventAggregates (timed by N seconds, omit empty)
channels (should also contain campaignSpec)
channelStateTrees (full state tree)
validatorMessages

## Middlewares

* Auth (check if a session exists)
* Channel (check if a channel exists)

## Validator roles

* Leader: aggregate all EventAggregates and write new States, broadcast them to other validators for signing
* Follower: do the same, but also toggle healthy/unhealthy states in the Channels collection upon big discrepancies


## TODO

- [x] bootstrap all routes
- [x] auth middleware; adapter/
- [x] channel middleware: channelLoad, channelExists 
- [x] basic sentry
- [x] dummy channels, test/db mongo load thingy
- [x] validator worker: scaffold producer, leader, follower
- [x] bignumber.js for state trees: we can't represent numbers as JS numbers
- [x] validator worker: producer: basic reaping EventAggregates and updating the state
- [x] validator worker: leader: signing, etherjs signer
- [x] merkelize and sign: it should sort all hashes before putting into the tree
- [x] spec and/or extra info in channels
- [x] validator worker: propagate events; leader propagates NewState ev to follower(s)
- [x] validator worker: follower: propagates their ApproveState back to the leader (or to EVERY other validator)
- [x] validator worker: follower: should validate each individual proposed state, and validate whether it's a valid state transition
- [x] validator worker: follower: state validation function; validator events for new states should always have the FULL state; so that the follower can easily compare old/new
- [x] validator worker: fix follower tick issue: https://github.com/AdExNetwork/adex-validator-stack-js/issues/5, improved logging
- [x] validator worker: follower: monitor health
- [x] aggregator: we should count by publisher, not by user
- [x] auth: proper ethereum-based token (EWT/JWT?)
- [x] adapter: make signing/whoami work (ethersjs signer); consider moving current adapter to adapter/mock
- [x] validator worker/watcher: re-consider `init` event: we won't do it; instead; we will just do a round of NewState/ApproveState
- [x] tests: pure functions in follower (isValidTransition, getHealth)
- [x] auth token: check if signed message contains a ref to our ID (might need a refactor, since the sentry needs to initialize the adapter)
- [x] sentry: do not record events if we are not a validator of the channel
- [x] DB indexes for every complex query
- [ ] potential bug - what happens if you receive ApproveState but don't know about the channel yet; perhaps go back to Init or just do a Heartbeat
- [ ] ethereum watcher, configs
- [ ] tests: what else can be purified?
- [ ] bench system, pipelined wrk
- [ ] validator worker: respect campaignSpec and per-impression payment
- [ ] figure out "max channels" dynamic: we need a reliable cap; therefore, we need a way for people to check if the limit is reached
- [ ] figure out how to properly do limiting max number of events per user (hint: in the sentry by IP/pow)
- [ ] code TODOs
- [ ] sentry: ensure there's an easy way to get all signed states historically, and at least one validator from which we can get a state signed by 2 (or more) at once; easiest solution is simply to allow getting last N validator events (which will contain sigs)
- [ ] dockerize
- [ ] special event types: e.g. validator fees
- [ ] auth token: eras, invalidate periodically and use a new one
- [ ] validatorWorker limit: make a locking mechanism to ensure it can't run in a more than one instance
- [ ] tests: full integration tests for everything
