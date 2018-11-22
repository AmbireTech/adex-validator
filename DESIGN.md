## Stack

NodeJS 10 + MongoDB

## Status

Reference implementation

## Colletions

sessions
eventAggregates (timed by N seconds, omit empty)
states - full history, with our own sig
validatorEvents
channels
channelCampaignSpecs
channelStates

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
- [ ] bignumber.js for state trees: we can't represent numbers as JS numbers
- [ ] validator worker: scaffold producer, leader, follower
- [ ] validator worker: producer: basic reaping EventAggregates and updating the state
- [ ] validator worker: leader: signing, etherjs signer
- [ ] validator worker: follower: state validation function
- [ ] validator worker: follower: monitor health
- [ ] validator worker: propagate events to other validators; decide whether the leader does it, or follower(s), or both
- [ ] auth: proper ethereum-based token (EWT/JWT?)
- [ ] watcher, ethereum configs
- [ ] bench system, pipelined wrk
- [ ] validator worker: respect campaignSpec and per-impression payment
