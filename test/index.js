#!/usr/bin/env node
const tape = require('tape')

const BN = require('bn.js')
const { isValidTransition, isHealthy } = require('../services/validatorWorker/lib/followerRules')
const { getStateRootHash } = require('../services/validatorWorker/lib')
const schema = require('../routes/schema');
const dummyAdapter = require('../adapters/dummy')
const { Joi } = require('celebrate')
const fixtures = require('./fixtures')

const dummyChannel = { depositAmount: new BN(100) }

tape('isValidTransition: empty to empty', function(t) {
	t.ok(isValidTransition(dummyChannel, {}, {}), 'is valid transition')
	t.end()
})

tape('isValidTransition: a valid transition', function(t) {
	t.ok(isValidTransition(dummyChannel, {}, { a: new BN(100) }), 'is valid transition')
	t.end()
})

tape('isValidTransition: more funds than dummyChannel', function(t) {
	t.notOk(
		isValidTransition(dummyChannel, {}, { a: new BN(51), b: new BN(50) }),
		'not a valid transition'
	)
	t.end()
})

tape('isValidTransition: single value is lower', function(t) {
	t.notOk(
		isValidTransition(dummyChannel, { a: new BN(55) }, { a: new BN(54) }),
		'not a valid transition'
	)
	t.end()
})

tape('isValidTransition: a value is lower, but overall sum is higher', function(t) {
	t.notOk(
		isValidTransition(dummyChannel, { a: new BN(55) }, { a: new BN(54), b: new BN(3) }),
		'not a valid transition'
	)
	t.end()
})

tape('isValidTransition: overall sum is lower', function(t) {
	t.notOk(
		isValidTransition(dummyChannel, { a: new BN(54), b: new BN(3) }, { a: new BN(54) }),
		'not a valid transition'
	)
	t.end()
})

tape('isValidTransition: overall sum is the same, but we remove an entry', function(t) {
	t.notOk(
		isValidTransition(dummyChannel, { a: new BN(54), b: new BN(3) }, { a: new BN(57) }),
		'not a valid transition'
	)
	t.end()
})

tape('isValidTransition: transition to a state with a negative number', function(t) {
	t.notOk(
		isValidTransition(dummyChannel, {}, { a: new BN(51), b: new BN(-5) }),
		'not a valid transition'
	)
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
	;[
		{
			channel: {
				id: 'testing'
			},
			balances: {
				publisher: 1,
				tester: 2
			},
			expectedHash: 'da9b42bb60da9622404cade0aec4cda0a10104c6ec5f07ad67de081abb58c803'
		},
		{
			channel: {
				id: 'fake'
			},
			balances: {
				publisher: 0
			},
			expectedHash: '0b64767e909e9f36ab9574e6b93921390c40a0d899c3587db3b2df077b8e87d7'
		}
	].forEach(({ expectedHash, channel, balances }) => {
		const actualHash = getStateRootHash(dummyAdapter, channel, balances)
		t.equal(actualHash, expectedHash, 'correct root hash')
	})

	t.end()
})

//
// Fees
//
tape('getBalancesAfterFeesTree: returns the same tree with zero fees', function(t) {
	// some semi-randomly created trees
	const tree1 = { a: '1001', b: '3124', c: '122' }
	const tree2 = { a: '1', b: '2', c: '3' }
	const tree3 = { a: '1' }
	const tree4 = { a: '1', b: '99999' }
	const zeroFeeChannel = {
		spec: { validators: [{ id: 'one', fee: '0' }, { id: 'two', fee: '0' }] },
		depositAmount: '100000'
	}
	t.deepEqual(toBNStringMap(getBalancesAfterFeesTree(tree1, zeroFeeChannel)), tree1)
	t.deepEqual(toBNStringMap(getBalancesAfterFeesTree(tree2, zeroFeeChannel)), tree2)
	t.deepEqual(toBNStringMap(getBalancesAfterFeesTree(tree3, zeroFeeChannel)), tree3)
	t.deepEqual(toBNStringMap(getBalancesAfterFeesTree(tree4, zeroFeeChannel)), tree4)
	t.end()
})

tape('getBalancesAfterFeesTree: applies fees correctly', function(t) {
	const sum = tree =>
		Object.values(tree)
			.map(a => new BN(a, 10))
			.reduce((a, b) => a.add(b), new BN(0))
	const channel = {
		spec: { validators: [{ id: 'one', fee: '50' }, { id: 'two', fee: '50' }] },
		depositAmount: '10000'
	}
	// partially distributed
	const tree1 = { a: '1000', b: '1200' }
	const tree1ExpectedResult = { a: '990', b: '1188', one: '11', two: '11' }
	t.deepEqual(sum(tree1), sum(tree1ExpectedResult))
	t.deepEqual(toBNStringMap(getBalancesAfterFeesTree(tree1, channel)), tree1ExpectedResult)

	// fully distributed; this also tests rounding error correction
	const tree2 = { a: '105', b: '195', c: '700', d: '5000', e: '4000' }
	const tree2ExpectedResult = {
		a: '103',
		b: '193',
		c: '693',
		d: '4950',
		e: '3960',
		one: '51',
		two: '50'
	}
	t.deepEqual(sum(tree2), sum(tree2ExpectedResult))
	t.deepEqual(toBNStringMap(getBalancesAfterFeesTree(tree2, channel)), tree2ExpectedResult)

	t.end()
})

// schema;
tape('create campaign validation schema', function(t) {
	fixtures.createCampaign.forEach(function([data, conf, expected]){
		Joi.validate(data, schema.createCampaign(conf), function (err, value) {
			if(err) err = err.toString()	
			t.equal(err, expected, "Should validate object properly")
		}); 
	})

	t.end()
})


tape('campaign validation schema', function(t) {
	fixtures.validateCampaign.forEach(function([data, conf, expected]){
		Joi.validate(data, schema.validateCampaign(conf), function (err, value) {
			if(err) err = err.toString()	
			t.equal(err, expected, "Should validate object properly")
		}); 
	})

	t.end()
})


// @TODO: event aggregator
// @TODO: producer, possibly leader/follower; mergePayableIntoBalances
