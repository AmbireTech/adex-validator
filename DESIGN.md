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
- [ ] channel middleware: loadChannel, checkIfChannelExists
- [ ] basic sentry
- [ ] dummy channels, test/db mongo load thingy
- [ ] bench system, pipelined wrk
- [ ] validator worker: basic reaping EventAggregates and upating the state
- [ ] validator worker: signing, etherjs signer
- [ ] validator worker: follow - monitor health
- [ ] validator worker: propagate events to other validators
- [ ] watcher, ethereum configs
