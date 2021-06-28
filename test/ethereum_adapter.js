#!/usr/bin/env node
const tape = require('tape-catch')
const assert = require('assert')
const { providers } = require('ethers')
const { readFileSync } = require('fs')
const formatAddress = require('ethers').utils.getAddress
const BN = require('bn.js')
const { ethereum } = require('../adapters')
const cfg = require('../cfg')
const { deployContracts, sampleChannel, depositToChannel, sweep } = require('./ethereum')
const ewt = require('../adapters/ethereum/ewt')
const { toEthereumChannel } = require('../adapters/ethereum')

const tryCatchAsync = async function(fn, errMsg) {
	try {
		await fn()
		// eslint-disable-next-line no-throw-literal
		throw null
	} catch (e) {
		assert.ok(e, 'should throw an error')
		assert.equal(e.message, errMsg, `Expected an error "${errMsg}" but got "${e.message}" instead`)
	}
}

const opts = {
	keystoreFile: `${__dirname}/resources/keystore.json`,
	keystorePwd: 'adexvalidator'
}

const provider = new providers.JsonRpcProvider('http://localhost:8545')

// ethereum adapter
tape('should init ethereum adapter', async function(t) {
	const ethereumAdapter = new ethereum.Adapter(opts, cfg, provider)
	// should resolve successfully
	await ethereumAdapter.init(opts)
	t.pass('succesfully init ethereum adapter')
	t.end()
})

tape('should fail to init adapter with incorrect opts', async function(t) {
	const ethereumAdapter = new ethereum.Adapter({}, cfg, provider)

	// should an throw error cos of invalid params
	await tryCatchAsync(async () => ethereumAdapter.init(), 'keystoreFile required')
	t.pass('should fail to init adapter with incorrect opts')
	t.end()
})

tape('Should fail to unlock keystore with wrong password', async function(t) {
	// eslint-disable-next-line no-shadow
	const opts = {
		keystoreFile: `${__dirname}/resources/keystore.json`,
		keystorePwd: 'adexvalidator1'
	}
	const ethereumAdapter = new ethereum.Adapter(opts, cfg, provider)
	await ethereumAdapter.init()
	await tryCatchAsync(async () => ethereumAdapter.unlock(), 'invalid password')
	t.pass('should fail to unlock keystore with wrong password')
	t.end()
})

tape('Should unlock keystore with right password', async function(t) {
	const ethereumAdapter = new ethereum.Adapter(opts, cfg, provider)

	await ethereumAdapter.init()
	await ethereumAdapter.unlock()
	t.pass('successfully unlocked keystore with right password')
	t.end()
})

tape('Should get whoami', async function(t) {
	const ethereumAdapter = new ethereum.Adapter(opts, cfg, provider)

	await ethereumAdapter.init()

	const expected = `0x${JSON.parse(readFileSync(opts.keystoreFile, 'utf-8')).address}`.toLowerCase()
	const actual = ethereumAdapter.whoami().toLowerCase()

	t.equal(actual, expected, 'should return the keystore address')
	t.end()
})

tape('Should sign message', async function(t) {
	const ethereumAdapter = new ethereum.Adapter(opts, cfg, provider)

	await ethereumAdapter.init()
	await ethereumAdapter.unlock()

	const message = 'hello world'
	const actual = await ethereumAdapter.sign(message)
	const expected =
		'0xb139c99dbc0ab504f55ba0aa1e0d5662b1cb32aa207e8bb9b6204cab78e234901bd7abcf0d7d303ed276de735c1459018e672c5bf183690e2a2796670099757e1b'

	t.equal(actual, expected, 'should sign message appropiately')
	t.end()
})

tape('Should verify message', async function(t) {
	const ethereumAdapter = new ethereum.Adapter(opts, cfg, provider)

	await ethereumAdapter.init()
	await ethereumAdapter.unlock()

	const message = 'hello world'
	const actual = await ethereumAdapter.sign(message)
	const expected =
		'0xb139c99dbc0ab504f55ba0aa1e0d5662b1cb32aa207e8bb9b6204cab78e234901bd7abcf0d7d303ed276de735c1459018e672c5bf183690e2a2796670099757e1b'

	t.equal(actual, expected, 'should sign message appropiately')
	t.end()
})

tape('should getAuthFor and sessionFromToken for validator', async function(t) {
	const ethereumAdapter = new ethereum.Adapter(opts, cfg, provider)

	await ethereumAdapter.init()
	await ethereumAdapter.unlock()

	const token = await ethereumAdapter.getAuthFor({
		id: formatAddress('0x2bdeafae53940669daa6f519373f686c1f3d3393') // this a hardcoded adress from the keystore.json
	})
	t.ok(token, 'should give token for channel validator')

	const sess = await ethereumAdapter.sessionFromToken(token)
	t.ok(sess, 'should give token for sesssion for validator')

	t.end()
})

tape('EWT should sign message', async function(t) {
	const ethereumAdapter = new ethereum.Adapter(opts, cfg, provider)

	const payload = {
		id: 'awesomeValidator',
		era: 100000
	}

	await ethereumAdapter.init(opts)
	const wallet = await ethereumAdapter.unlock(opts)

	const actual = await ewt.sign(wallet, payload)
	const expected =
		'eyJ0eXBlIjoiSldUIiwiYWxnIjoiRVRIIn0.eyJpZCI6ImF3ZXNvbWVWYWxpZGF0b3IiLCJlcmEiOjEwMDAwMCwiYWRkcmVzcyI6IjB4MmJEZUFGQUU1Mzk0MDY2OURhQTZGNTE5MzczZjY4NmMxZjNkMzM5MyJ9.gGw_sfnxirENdcX5KJQWaEt4FVRvfEjSLD4f3OiPrJIltRadeYP2zWy9T2GYcK5xxD96vnqAw4GebAW7rMlz4xw'
	t.equal(actual, expected, 'properly generated the right message')
	t.end()
})

tape('EWT: should verify message', async function(t) {
	const actual = await ewt.verify(
		'eyJ0eXBlIjoiSldUIiwiYWxnIjoiRVRIIn0.eyJpZCI6ImF3ZXNvbWVWYWxpZGF0b3IiLCJlcmEiOjI1OTE0NzkzLCJhZGRyZXNzIjoiMHgyYkRlQUZBRTUzOTQwNjY5RGFBNkY1MTkzNzNmNjg2YzFmM2QzMzkzIn0.FeqZaINRG3N2zjJUpeBdfAjnbsjM8qCyZaunpTvCuxxPKo7p7DW255xxhAyGK68tF3v8vbTdo_mfh0kxosfomhw'
	)
	const expected = {
		from: '0x2bDeAFAE53940669DaA6F519373f686c1f3d3393',
		payload: {
			id: 'awesomeValidator',
			era: 25914793,
			address: '0x2bDeAFAE53940669DaA6F519373f686c1f3d3393'
		}
	}
	t.deepEqual(actual, expected, 'should verify message properly')
	t.end()
})

tape('getDepositFor', async function(t) {
	const { core, token, sweeper } = await deployContracts()

	const channel = await sampleChannel()
	const ethChannel = await toEthereumChannel(channel)
	const MINIMUM_DEPOSIT = '100000000'
	const ethereumAdapter = new ethereum.Adapter(
		opts,
		{
			...cfg,
			ETHEREUM_CORE_ADDR: core.address,
			SWEEPER_ADDRESS: sweeper.address,
			TOKEN_ADDRESS_WHITELIST: {
				[token.address.toLowerCase()]: {
					MINIMUM_DEPOSIT,
					MINIMAL_FEE: '100000000',
					DECIMALS: 18
				}
			}
		},
		provider
	)

	const create2Addr = ethereumAdapter.getCreate2Address(
		core.address,
		sweeper.address,
		ethChannel,
		channel.leader
	)

	// deposit without using create2 i.e. deposit directly on outpace
	const toDeposit = new BN(`${MINIMUM_DEPOSIT}0`)
	await depositToChannel(ethChannel, channel.leader, toDeposit.toString())
	const depositWithoutCreate2 = await ethereumAdapter.getDepositFor(channel, channel.leader)
	t.equal(
		depositWithoutCreate2.total.toString(),
		toDeposit.toString(),
		'depositWithoutCreate2: incorrect total balance'
	)
	t.equal(
		depositWithoutCreate2.create2Balance.toString(),
		'0',
		'depositWithoutCreate2: incorrect create2balance'
	)

	// deposit with create2 below minimum deposit
	const toDeposit1 = new BN(`10000000`)
	await (await token.setBalanceTo(create2Addr, toDeposit1.toString())).wait()
	const depositWithCreate2 = await ethereumAdapter.getDepositFor(channel, channel.leader)
	t.equal(
		depositWithCreate2.total.toString(),
		// eslint-disable-next-line prettier/prettier
		toDeposit.toString(),
		'depositWithCreate2: incorrect total balance'
	)
	t.equal(
		depositWithCreate2.create2Balance.toString(),
		'0',
		'depositWithCreate2: incorrect create2balance'
	)

	// deposit with create2 exceed minimum deposit
	const toDepositExceed = new BN(`${MINIMUM_DEPOSIT}0`)
	await (await token.setBalanceTo(create2Addr, toDepositExceed.toString())).wait()
	const depositWithCreate2MinimumExceed = await ethereumAdapter.getDepositFor(
		channel,
		channel.leader
	)

	t.equal(
		depositWithCreate2MinimumExceed.total.toString(),
		// eslint-disable-next-line prettier/prettier
		toDeposit.add(toDepositExceed).toString(),
		'depositWithCreate2MinimumExceed: incorrect total balance'
	)

	t.equal(
		depositWithCreate2MinimumExceed.create2Balance.toString(),
		toDepositExceed.toString(),
		'depositWithCreate2MinimumExceed: incorrect create2balance'
	)

	// run sweeper to sweep deposits on create2
	await sweep(ethChannel, ethChannel.leader)
	const depositAfterSweep = await ethereumAdapter.getDepositFor(channel, channel.leader)

	t.equal(
		depositAfterSweep.total.toString(),
		toDeposit.add(toDepositExceed).toString(),
		'depositAfterSweep: incorrect total balance'
	)

	t.equal(
		depositAfterSweep.create2Balance.toString(),
		'0',
		'depositAfterSweep: incorrect create2balance'
	)

	t.end()
})
