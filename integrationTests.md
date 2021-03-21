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
