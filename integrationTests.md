new mini test kit:

create a campaign
submit events
verify that payments appear in NewState/ApproveState, incl. fees
verify that /analytics returns stuff

mini test kit v2: same, but add failure case tests to each one

routes:
POST /channel/{id}/events: non existant channel
POST /channel/{id}/validator-messages: malformed messages (leader -> follower)
POST /channel/{id}/events: malformed events
POST /channel/{id}/events: should reject empty array events
POST /channel/{id}/validator-messages: wrong authentication
POST /channel/{id}/events: CLOSE: a publisher but not a creator
POST /channel/validate: invalid schema
POST /channel: should not work with invalid withdrawPeriodStart
should throw invalid withdrawPeriodStart error
POST /channel: should reject validUntil greater than one year
channel.validUntil should not be greater than one year
should throw invalid validUntil error
POST /channel: create channel
POST /channel: should not create channel if it is not valid
POST /channel: should not create channel if it does not pass adapter validation
POST /channel/{id}/events: rate limits
should prevent submitting events for expired channel
should prevent submitting events for a channel in withdraw period
should prevent events after withdraw period
should test analytic auth required routes


TODO add a 'create campaign' test; or maybe that's covered by routes

integration:
submit events and ensure they are accounted for
new states are not produced when there are no new aggregates
heartbeat has been emitted
RejectState: wrong signature (InvalidSignature)
RejectState: deceptive stateRoot (InvalidRootHash)
RejectState: invalid OUTPACE transition
RejectState: invalid OUTPACE transition: exceed deposit
cannot exceed channel deposit
health works correctly
health works correctly: should reject state if health is too different
should close channel
should record clicks
should record: correct payout with targetingRules, consistent with balances
analytics routes return correct values
targetingRules: event to update them works
targetingRules: onlyShowIf is respected and returns a HTTP error code
targetingRules: multiple rules are applied, pricingBounds are honored
validatorWorker: does not apply empty aggr
/validator-messages: reject Accounting/NewState messages with empty balances
/channel: reject channel spec greater than
should reject posting event on an exhausted channel and post no additional heartbeat
