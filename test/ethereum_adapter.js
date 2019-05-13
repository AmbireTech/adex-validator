#!/usr/bin/env node
const tape = require('tape-catch')
const assert = require('assert')
const { providers } = require('ethers')
const { readFileSync } = require('fs')
const formatAddress = require('ethers').utils.getAddress
const { ethereum } = require('../adapters')
const cfg = require('../cfg')
const { channelOpen, deployContracts, sampleChannel } = require('./ethereum')
const ewt = require('../adapters/ethereum/ewt')
const fixtures = require('./fixtures')

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
let validChannel

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

tape('should validate channel properly', async function(t) {
	await getValidChannel()
	t.pass('succesfully validated channel')
	t.end()
})

tape('shoud not validate channel with invalid id', async function(t) {
	const { core } = await deployContracts()
	const ethereumAdapter = new ethereum.Adapter(opts, { ETHEREUM_CORE_ADDR: core.address }, provider)

	const okChannel = await getValidChannel()

	const invalidChannelId = {
		...okChannel,
		id: '0xdffsfsfsfs'
	}
	await tryCatchAsync(
		async () => ethereumAdapter.validateChannel(invalidChannelId),
		'channel.id is not valid'
	)
	t.end()
})

tape('should not validate invalid channels', async function(t) {
	const { core } = await deployContracts()

	const okChannel = await getValidChannel()

	fixtures.invalidChannels(okChannel).forEach(async item => {
		const [channel, config, err] = item

		const ethAdapter = new ethereum.Adapter(
			opts,
			{ ...config, ETHEREUM_CORE_ADDR: core.address },
			provider
		)
		// ethereum representation
		const ethChannel = ethereum.toEthereumChannel(channel)
		channel.id = ethChannel.hashHex(core.address)

		await tryCatchAsync(async () => ethAdapter.validateChannel(channel), err)
	})

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

async function getValidChannel() {
	if (validChannel) return validChannel
	const { core } = await deployContracts()
	const ethereumAdapter = new ethereum.Adapter(opts, { ETHEREUM_CORE_ADDR: core.address }, provider)

	// get a sample valid channel
	const channel = await sampleChannel()
	const ethChannel = ethereum.toEthereumChannel(channel)
	channel.id = ethChannel.hashHex(core.address)

	// open channel onchain
	await channelOpen(ethChannel)
	const validate = await ethereumAdapter.validateChannel(channel)
	assert.ok(validate, 'channel should pass validation')
	// assign channel to validChannel
	validChannel = channel
	return channel
}
