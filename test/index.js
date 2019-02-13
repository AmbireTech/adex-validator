#!/usr/bin/env node
const tape = require('tape')

const BN = require('bn.js')
const { isValidTransition, isHealthy } = require('../services/validatorWorker/lib/followerRules')
const { getStateRootHash } = require('../services/validatorWorker/lib')
const dummyAdapter = require('../adapters/dummy')
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
// isHealthy
//
tape('isHealthy: the approved balance tree >= our accounting: HEALTHY', function(t) {
	t.equal(isHealthy({ a: new BN(50) }, { a: new BN(50) }), true)
	t.equal(isHealthy({ a: new BN(50) }, { a: new BN(60) }), true)
	t.end()
})

tape('isHealthy: the approved balance tree is positive, our accounting is 0: HEALTHY', function(t) {
	t.equal(isHealthy({}, { a: new BN(50) }), true)
	t.end()
})

tape('isHealthy: the approved balance tree has less, but within margin: HEALTHY', function(t) {
	t.equal(isHealthy({ a: new BN(80) }, { a: new BN(79) }), true)
	t.end()
})

tape('isHealthy: the approved balance tree has less: UNHEALTHY', function(t) {
	t.equal(isHealthy({ a: new BN(80) }, { a: new BN(70) }), false)
	t.end()
})

tape('isHealthy: they have the same sum, but different entities are earning', function(t) {
	t.equal(isHealthy({ a: new BN(80) }, { b: new BN(80) }), false)
	t.equal(isHealthy({ a: new BN(80) }, { b: new BN(40), a: new BN(40) }), false)
	t.equal(isHealthy({ a: new BN(80) }, { b: new BN(20), a: new BN(60) }), false)
	t.equal(isHealthy({ a: new BN(80) }, { b: new BN(2), a: new BN(78) }), true)
	t.equal(isHealthy({ a: new BN(100), b: new BN(1) }, { a: new BN(100) }), true)
	t.end()
})

//
// State Root Hash
//
tape('getStateRootHash: returns correct result', function(t) {
	[
		{
			channel: {
				id: "testing"
			},
			balances: {
				"publisher": 1,
				"tester": 2
			},
			expectedHash: "da9b42bb60da9622404cade0aec4cda0a10104c6ec5f07ad67de081abb58c803"
		},
		{
			channel: {
				id: "fake"
			},
			balances: {
				"publisher": 0,
			},
			expectedHash: "0b64767e909e9f36ab9574e6b93921390c40a0d899c3587db3b2df077b8e87d7"
		}
	].forEach(({ expectedHash, channel, balances }) => {
		const actualHash = getStateRootHash(channel, balances, dummyAdapter)
		t.equal(actualHash, expectedHash, "correct root hash")
	});
	
	t.end()
})

// @TODO: event aggregator
// @TODO: producer, possibly leader/follower; mergePayableIntoBalances
