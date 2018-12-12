const tape = require('tape')

const BN = require('bn.js')
const { isValidTransition, campaignHealth } = require('../services/validatorWorker/lib/followerRules')

const channel = { depositAmount: new BN(100) }

tape('isValidTransition: empty to empty', function(t) {
	t.ok(isValidTransition(channel, {}, {}), 'is valid transition')
	t.end()
})

tape('isValidTransition: a valid transition', function(t) {
	t.ok(isValidTransition(channel, {}, { a: new BN(9) }), 'is valid transition')
	t.end()
})

tape('isValidTransition: more funds than channel', function(t) {
	t.notOk(isValidTransition(channel, {}, { a: new BN(101) }), 'not a valid transition')
	t.end()
})

tape('isValidTransition: single value is lower', function(t) {
	t.end()
})

tape('isValidTransition: a value is lower, but overall sum is higher', function(t) {
	t.end()
})

tape('isValidTransition: overall sum is lower', function(t) {
	t.end()
})
