#!/usr/bin/env node
const tape = require('tape-catch')
const assert = require('assert')
const { providers } = require('ethers')
const formatAddress = require('ethers').utils.getAddress
const { ethereum } = require('../adapters')
const cfg = require('../cfg')
const { channelOpen, deployContracts, sampleChannel } = require('./etheruem')
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
const ethereumAdapter = new ethereum.Adapter(opts, cfg, provider)
let validChannel
// ethereum adapter
// tape('should init ethereum adapter', async function(t) {
// 	// should resolve successfully
// 	await ethereumAdapter.init(opts)
// 	t.pass('succesfully init ethereum adapter')
// 	t.end()
// })

// tape('should fail to init adapter with incorrect opts', async function(t) {
// 	const opts = {}
// 	// should an throw error cos of invalid params
// 	await tryCatchAsync(async () => ethereumAdapter.init(opts), 'keystoreFile required')
// 	t.pass('should fail to init adapter with incorrect opts')
// 	t.end()
// })

// tape('Should fail to unlock keystore with wrong password', async function(t) {
// 	const opts = {
// 		keystoreFile: `${__dirname}/resources/keystore.json`,
// 		keystorePwd: 'adexvalidator1'
// 	}

// 	await ethereumAdapter.init(opts)
// 	await tryCatchAsync(async () => ethereumAdapter.unlock(opts), 'invalid password')
// 	t.pass('should fail to unlock keystore with wrong password')
// 	t.end()
// })

// tape('Should unlock keystore with right password', async function(t) {
// 	await ethereumAdapter.init(opts)
// 	await ethereumAdapter.unlock(opts)
// 	t.pass('successfully unlocked keystore with right password')
// 	t.end()
// })

// tape('Should get whoami', async function(t) {
// 	await ethereumAdapter.init(opts)

// 	const expected = `0x${JSON.parse(readFileSync(opts.keystoreFile, 'utf-8')).address}`.toLowerCase()
// 	const actual = ethereumAdapter.whoami().toLowerCase()

// 	t.equal(actual, expected, 'should return the keystore address')
// 	t.end()
// })

// tape('Should sign message', async function(t) {
// 	await ethereumAdapter.init(opts)
// 	await ethereumAdapter.unlock(opts)

// 	const message = 'hello world'
// 	const actual = await ethereumAdapter.sign(message)
// 	const expected =
// 		'0xb139c99dbc0ab504f55ba0aa1e0d5662b1cb32aa207e8bb9b6204cab78e234901bd7abcf0d7d303ed276de735c1459018e672c5bf183690e2a2796670099757e1b'

// 	t.equal(actual, expected, 'should sign message appropiately')
// 	t.end()
// })

tape('should getAuthFor and sessionFromToken for validator', async function(t) {
	await ethereumAdapter.init(opts)
	await ethereumAdapter.unlock(opts)

	const token = await ethereumAdapter.getAuthFor({
		id: formatAddress('0x2bdeafae53940669daa6f519373f686c1f3d3393') // this a hardcoded adress from the keystore.json
	})
	t.ok(token, 'should give token for channel validator')

	const sess = await ethereumAdapter.sessionFromToken(token)
	t.ok(sess, 'should give token for sesssion for validator')

	t.end()
})

tape('should validate channel properly', async function(t) {
	await ethereumAdapter.init(opts)
	await ethereumAdapter.unlock(opts)

	// deploy contracts onchain
	const { core } = await deployContracts()
	const ethAdapter = new ethereum.Adapter(opts, { ETHEREUM_CORE_ADDR: core.address }, provider)
	// get a sample valid channel
	const channel = await sampleChannel()
	const ethChannel = ethereum.toEthereumChannel(channel)
	channel.id = ethChannel.hashHex(core.address)

	// open channel onchain
	await channelOpen(ethChannel)

	const validate = await ethAdapter.validateChannel(channel)
	// assign channel to validChannel
	validChannel = channel
	t.ok(validate, 'should validate channel properly')

	t.end()
})

tape('shoud not validate channel with invalid id', async function(t) {
	await ethereumAdapter.init(opts)
	await ethereumAdapter.unlock(opts)
	const { core } = await deployContracts()

	const okChannel = await getValidChannel()

	const ethAdapter = new ethereum.Adapter(opts, { ETHEREUM_CORE_ADDR: core.address }, provider)
	const invalidChannelId = {
		...okChannel,
		id: '0xdffsfsfsfs'
	}
	await tryCatchAsync(
		async () => ethAdapter.validateChannel(invalidChannelId),
		'channel.id is not valid'
	)
	t.end()
})

tape('should not validate invalid channels', async function(t) {
	await ethereumAdapter.init(opts)
	await ethereumAdapter.unlock(opts)

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
	const payload = {
		id: 'awesomeValidator',
		era: 100000
	}

	let wallet = await ethereumAdapter.init(opts)
	wallet = await ethereumAdapter.unlock(opts)

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
	await ethereumAdapter.init(opts)
	await ethereumAdapter.unlock(opts)

	// deploy contracts onchain
	const { core } = await deployContracts()
	const ethAdapter = new ethereum.Adapter(opts, { ETHEREUM_CORE_ADDR: core.address }, provider)
	// get a sample valid channel
	const channel = await sampleChannel()
	const ethChannel = ethereum.toEthereumChannel(channel)
	channel.id = ethChannel.hashHex(core.address)

	// open channel onchain
	await channelOpen(ethChannel)
	await ethAdapter.validateChannel(channel)
	// assign channel to validChannel
	validChannel = channel
	return channel
}
