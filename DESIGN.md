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
- [ ] validator worker: basic reaping EventAggregates and updating the state
- [ ] validator worker: signing, etherjs signer
- [ ] validator worker: follow: state validation function
- [ ] validator worker: follow: monitor health
- [ ] validator worker: propagate events to other validators
- [ ] auth: proper ethereum-based token (EWT/JWT?)
- [ ] watcher, ethereum configs
- [ ] bench system, pipelined wrk
- [ ] validator worker: respect campaignSpec and per-impression payment
