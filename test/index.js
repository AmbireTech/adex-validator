#!/usr/bin/env node
const tape = require('tape')

const BN = require('bn.js')
const { isValidTransition, getHealth } = require('../services/validatorWorker/lib/followerRules')

const channel = { depositAmount: new BN(100) }

tape('isValidTransition: empty to empty', function(t) {
	t.ok(isValidTransition(channel, {}, {}), 'is valid transition')
	t.end()
})

tape('isValidTransition: a valid transition', function(t) {
	t.ok(isValidTransition(channel, {}, { a: new BN(100) }), 'is valid transition')
	t.end()
})

tape('isValidTransition: more funds than channel', function(t) {
	t.notOk(isValidTransition(channel, {}, { a: new BN(51), b: new BN(50) }), 'not a valid transition')
	t.end()
})

tape('isValidTransition: single value is lower', function(t) {
	t.notOk(isValidTransition(channel, { a: new BN(55) }, { a: new BN(54) }), 'not a valid transition')
	t.end()
})

tape('isValidTransition: a value is lower, but overall sum is higher', function(t) {
	t.notOk(isValidTransition(channel, { a: new BN(55) }, { a: new BN(54), b: new BN(3) }), 'not a valid transition')
	t.end()
})

tape('isValidTransition: overall sum is lower', function(t) {
	t.notOk(isValidTransition(channel, { a: new BN(54), b: new BN(3) }, { a: new BN(54) }), 'not a valid transition')
	t.end()
})

tape('isValidTransition: overall sum is the same, but we remove an entry', function(t) {
	t.notOk(isValidTransition(channel, { a: new BN(54), b: new BN(3) }, { a: new BN(57) }), 'not a valid transition')
	t.end()
})

tape('isValidTransition: transition to a state with a negative number', function(t) {
	t.notOk(isValidTransition(channel, {}, { a: new BN(51), b: new BN(-5) }), 'not a valid transition')
	t.end()
})


//
// getHealth
//
tape('getHealth: the approved balance tree >= our accounting: HEALTHY', function(t) {
	t.equal(getHealth(channel, { a: new BN(50) }, { a: new BN(50) }), 'HEALTHY')
	t.equal(getHealth(channel, { a: new BN(50) }, { a: new BN(60) }), 'HEALTHY')
	t.end()
})

tape('getHealth: the approved balance tree is positive, our accounting is 0: HEALTHY', function(t) {
	t.equal(getHealth(channel, {}, { a: new BN(50) }), 'HEALTHY')
	t.end()
})

tape('getHealth: the approved balance tree has less, but within margin: HEALTHY', function(t) {
	t.equal(getHealth(channel, { a: new BN(80) }, { a: new BN(79) }), 'HEALTHY')
	t.end()
})

tape('getHealth: the approved balance tree has less: UNHEALTHY', function(t) {
	t.equal(getHealth(channel, { a: new BN(80) }, { a: new BN(70) }), 'UNHEALTHY')
	t.end()
})

// @TODO: event aggregator
// @TODO: producer, possibly leader/follower; mergePayableIntoBalances
