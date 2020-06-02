#!/usr/bin/env node
const tape = require('tape')

const BN = require('bn.js')
const { Joi } = require('celebrate')
const {
	isValidTransition,
	getHealthPromilles
} = require('../services/validatorWorker/lib/followerRules')
const { mergeAggrs } = require('../services/validatorWorker/lib/mergeAggrs')
const eventReducer = require('../services/sentry/lib/eventReducer')
const getPayout = require('../services/sentry/lib/getPayout')
const { getBalancesAfterFeesTree } = require('../services/validatorWorker/lib/fees')
const { getStateRootHash, toBNMap, toBNStringMap } = require('../services/validatorWorker/lib')

const schema = require('../routes/schemas')
const { Adapter } = require('../adapters/dummy')
const fixtures = require('./fixtures')
const dummyVals = require('./prep-db/mongo')

const dummyAdapter = new Adapter({ dummyIdentity: dummyVals.ids.leader }, {})
const dummyChannel = { depositAmount: new BN(100) }

const sum = tree =>
	Object.values(tree)
		.map(a => new BN(a, 10))
		.reduce((a, b) => a.add(b), new BN(0))

const genEvAggr = (count, recepient) => {
	const IMPRESSION = {
		eventCounts: { [recepient]: count },
		eventPayouts: { [recepient]: count * 10 }
	}
	return { events: { IMPRESSION } }
}

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
// getHealthPromilles
//
tape('getHealthPromilles: the approved balance tree >= our accounting', function(t) {
	t.ok(
		getHealthPromilles({ depositAmount: 50 }, { a: new BN(50) }, { a: new BN(50) }).eq(new BN(1000))
	)
	t.ok(
		getHealthPromilles({ depositAmount: 50 }, { a: new BN(50) }, { a: new BN(60) }).eq(new BN(1000))
	)
	t.end()
})

tape('getHealthPromilles: the approved balance tree is positive, our accounting is 0', function(t) {
	t.ok(getHealthPromilles({ depositAmount: 50 }, {}, { a: new BN(50) }).eq(new BN(1000)))
	t.end()
})

tape('getHealthPromilles: the approved balance tree has less, but within margin', function(t) {
	t.ok(
		getHealthPromilles({ depositAmount: 80 }, { a: new BN(80) }, { a: new BN(79) }).eq(new BN(988))
	)
	t.ok(
		getHealthPromilles({ depositAmount: 80 }, { a: new BN(2) }, { a: new BN(1) }).eq(new BN(988))
	)
	t.end()
})

tape('getHealthPromilles: the approved balance tree has significantly less', function(t) {
	t.ok(
		getHealthPromilles({ depositAmount: 80 }, { a: new BN(80) }, { a: new BN(70) }).eq(new BN(875))
	)
	t.end()
})

tape('getHealthPromilles: they have the same sum, but different entities are earning', function(t) {
	t.ok(
		getHealthPromilles({ depositAmount: 80 }, { a: new BN(80) }, { b: new BN(80) }).eq(new BN(0))
	)
	t.ok(
		getHealthPromilles(
			{ depositAmount: 80 },
			{ a: new BN(80) },
			{ b: new BN(40), a: new BN(40) }
		).eq(new BN(500))
	)
	t.ok(
		getHealthPromilles(
			{ depositAmount: 80 },
			{ a: new BN(80) },
			{ b: new BN(20), a: new BN(60) }
		).eq(new BN(750))
	)
	t.ok(
		getHealthPromilles(
			{ depositAmount: 80 },
			{ a: new BN(80) },
			{ b: new BN(2), a: new BN(78) }
		).eq(new BN(975))
	)
	t.ok(
		getHealthPromilles(
			{ depositAmount: 80 },
			{ a: new BN(100), b: new BN(1) },
			{ a: new BN(100) }
		).eq(new BN(988))
	)
	t.end()
})

//
// State Root Hash
//
tape('getStateRootHash: returns correct result', function(t) {
	;[
		{
			channel: {
				id: '0x8fd0f9172b8d8175c004d6e9e6c00322dbcf89e10665d06c2e76e014b5f491b3'
			},
			balances: {
				publisher: 1,
				tester: 2
			},
			expectedHash: '29bd22619ca2fff2b133760b22ae361d026ca27e679bcae7bb0ac55e5f246482'
		},
		{
			channel: {
				id: '0x8fd0f9172b8d8175c004d6e9e6c00322dbcf89e10665d06c2e76e014b5f492e2'
			},
			balances: {
				publisher: 0
			},
			expectedHash: 'b3ed14e49c79c293937549ac12b599c0cf3579f24aba7791a4396f6013f72090'
		}
	].forEach(({ expectedHash, channel, balances }) => {
		const actualHash = getStateRootHash(dummyAdapter, channel, balances).toString('hex')
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

tape('getBalancesAfterFeesTree: fees larger than deposit handled correctly', function(t) {
	const tree1 = { a: '10', b: '10' }
	const maliciousFeeChannel = {
		spec: { validators: [{ id: 'one', fee: '600' }, { id: 'two', fee: '600' }] },
		depositAmount: '1000'
	}
	t.throws(
		() => getBalancesAfterFeesTree(tree1, maliciousFeeChannel),
		/fee constraint violated/,
		'should not allow fees sum to exceed the deposit'
	)
	t.end()
})

tape('getBalancesAfterFeesTree: applies fees correctly', function(t) {
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

	// partially distributed; but validator is in the input tree
	const tree3 = { a: '100', b: '2000', one: '200' }
	const tree3Expected = { a: '99', b: '1980', one: '209', two: '11' }
	t.deepEqual(toBNStringMap(getBalancesAfterFeesTree(tree3, channel)), tree3Expected)

	t.end()
})

//
// mergeAggrs
//
tape('should merge event aggrs and apply fees', function(t) {
	// fees: 100
	// deposit: 10000
	const channel = {
		spec: { validators: [{ id: 'one', fee: '50' }, { id: 'two', fee: '50' }] },
		depositAmount: '10000'
	}
	const balancesBeforeFees = { a: '100', b: '200' }
	const newAccounting = mergeAggrs({ balancesBeforeFees }, [genEvAggr(5, 'a')], channel)
	t.equal(newAccounting.balancesBeforeFees.a, '150', 'balance of recepient incremented accordingly')
	t.equal(newAccounting.balances.a, '148', 'balanceAfterFees is ok')
	t.end()
})

tape('should never allow exceeding the deposit', function(t) {
	const channel = {
		spec: { validators: [{ id: 'one', fee: '50' }, { id: 'two', fee: '50' }] },
		depositAmount: '10000'
	}
	const depositAmount = new BN(channel.depositAmount, 10)
	const balancesBeforeFees = { a: '100', b: '200' }
	const newAccounting = mergeAggrs({ balancesBeforeFees }, [genEvAggr(1001, 'a')], channel)
	t.equal(
		newAccounting.balancesBeforeFees.a,
		'9800',
		'balance of recepient incremented accordingly'
	)
	t.equal(newAccounting.balancesBeforeFees.b, '200', 'balances of non-recipient remains the same')
	t.equal(newAccounting.balances.a, '9702', 'balanceAfterFees is ok')
	t.deepEqual(
		sum(toBNMap(newAccounting.balancesBeforeFees)),
		depositAmount,
		'sum(balancesBeforeFees) == depositAmount'
	)
	t.deepEqual(sum(toBNMap(newAccounting.balances)), depositAmount, 'sum(balances) == depositAmount')
	t.end()
})

// channel schema;
//
tape('create channel schema', function(t) {
	fixtures.createChannel.forEach(function([data, expected]) {
		Joi.validate(data, schema.createChannel, function(err) {
			let error = null
			if (err) error = err.toString()
			t.equal(error, expected, 'Should validate object properly')
		})
	})

	t.end()
})

// validator Message schema;
//
tape('validator message schema', function(t) {
	fixtures.validatorMessages.forEach(function([data, expected]) {
		Joi.validate(data, schema.validatorMessage, function(err) {
			let error = null
			if (err) error = err.toString()
			t.equal(error, expected, 'Should validate validator schema properly')
		})
	})

	t.end()
})

tape('sentry response schema', function(t) {
	const keys = Object.keys(fixtures.sentry)
	keys.forEach(key => {
		fixtures.sentry[key].forEach(function([data, expected]) {
			Joi.validate(data, schema.sentry[key], function(err) {
				let error = null
				if (err) error = err.toString()
				t.equal(error, expected, 'Should validate sentry response schema properly')
			})
		})
	})

	t.end()
})

tape('eventReducer: newAggr', function(t) {
	const channelId = 'eventReducerTest'
	const aggr = eventReducer.newAggr(channelId)

	t.equal(aggr.channelId, channelId, 'should return same channel id')
	t.deepEqual(aggr.events, {}, 'should have empty events')
	t.ok(aggr.created, 'should have created at date')

	t.end()
})

tape('getPayout: get event payouts', function(t) {
	fixtures.payoutRules.forEach(([channel, event, session, expectedResult, message]) => {
		t.deepEqual(getPayout(channel, event, session), expectedResult, message)
	})
	t.end()
})

tape('eventReducer: reduce', function(t) {
	const channel = {
		id: 'testing',
		creator: 'reduce',
		depositAmount: '100',
		spec: {}
	}
	const aggr = eventReducer.newAggr(channel.id)

	const event = {
		type: 'IMPRESSION',
		publisher: 'myAwesomePublisher'
	}

	// reduce 100 events
	for (let i = 0; i < 100; i += 1) {
		eventReducer.reduce(channel, aggr, event.type, getPayout(channel, event, {}))
	}

	const result = eventReducer.reduce(channel, aggr, event.type, getPayout(channel, event, {}))

	t.equal(result.channelId, channel.id, 'should have same channel id')
	t.equal(
		result.events.IMPRESSION.eventCounts.myAwesomePublisher,
		'101',
		'should have the correct number of eventsCounts'
	)
	t.equal(
		result.events.IMPRESSION.eventPayouts.myAwesomePublisher,
		'101',
		'should have the correct number of eventsPayouts'
	)

	const closeReduce = eventReducer.reduce(channel, aggr, 'CLOSE')

	t.equal(
		closeReduce.events.CLOSE.eventPayouts.reduce,
		'100',
		'should allocate deposit amount for close event'
	)
	t.equal(closeReduce.events.CLOSE.eventCounts.reduce.toString(), '1', 'should have event count')

	t.end()
})

// @TODO: producer, possibly leader/follower; mergePayableIntoBalances
