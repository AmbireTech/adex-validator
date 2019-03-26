const { MerkleTree, Channel, ChannelState } = require('adex-protocol-eth/js')
const { Wallet, Contract, utils, getDefaultProvider } = require('ethers')
const coreABI = require('adex-protocol-eth/abi/AdExCore')
const formatAddress = require('ethers').utils.getAddress
const util = require('util')
const assert = require('assert')
const fs = require('fs')
const crypto = require('crypto')
const BN = require('bn.js')

const readFile = util.promisify(fs.readFile)
const cfg = require('../../cfg')
const ewt = require('./ewt')

const core = new Contract(cfg.ETHEREUM_CORE_ADDR, coreABI, getDefaultProvider(cfg.ETHEREUM_NETWORK))

// Auth tokens that we have verified (tokenId => session)
const tokensVerified = new Map()

// AUth tokens that we've generated to authenticate with someone (address => token)
const tokensForAuth = new Map()

let address = null
let keystoreJson = null
let wallet = null

function init(opts) {
	assert.ok(typeof opts.keystoreFile === 'string', 'keystoreFile required')
	return readFile(opts.keystoreFile).then(json => {
		keystoreJson = json
		address = formatAddress(`0x${JSON.parse(json).address}`)
		// eslint-disable-next-line no-console
		console.log(`Ethereum address: ${whoami()}`)
	})
}

function unlock(opts) {
	assert.ok(keystoreJson != null, 'init() needs to be called before unlock()')
	assert.ok(typeof opts.keystorePwd === 'string', 'keystorePwd required')
	return Wallet.fromEncryptedJson(keystoreJson, opts.keystorePwd).then(w => {
		wallet = w
	})
}

function whoami() {
	return address
}

function sign(stateRoot) {
	assert.ok(wallet, 'unlock() must be called before sign()')
	// signMessage takes Arrayish, so Buffer too: https://docs.ethers.io/ethers.js/html/api-utils.html#arrayish
	return wallet.signMessage(stateRoot)
}

function verify(signer, stateRoot, signature) {
	assert.ok(stateRoot, 'valid state root must be provided')
	assert.ok(signature, 'valid signature must be provided')
	assert.ok(signer, 'valid signer is required')

	try {
		const from = utils.verifyMessage(stateRoot, signature)
		return Promise.resolve(signer === from)
	} catch (e) {
		return Promise.resolve(false)
	}
}

function getBalanceLeaf(acc, bal) {
	return Channel.getBalanceLeaf(acc, bal)
}

// Authentication tokens
function sessionFromToken(token) {
	const tokenId = token.slice(0, -16)
	if (tokensVerified.has(tokenId)) {
		// @TODO: validate era
		return Promise.resolve(tokensVerified.get(tokenId))
	}
	return ewt.verify(token).then(function({ from, payload }) {
		if (payload.id !== whoami()) {
			return Promise.reject(
				new Error('token payload.id !== whoami(): token was not intended for us')
			)
		}
		// @TODO: validate era too
		const sess = { uid: from, era: payload.era }
		tokensVerified.set(tokenId, sess)
		return sess
	})
}

function getSignableStateRoot(channelId, balanceRoot) {
	return Channel.getSignableStateRoot(channelId, balanceRoot)
}

function getAuthFor(validator) {
	// we will self-generate a challenge to contain whoever we're authenticating to, the validity period and the current time
	// we will sign that challenge and use that, and build a complete token using the EWT (JWT subset) standard
	// we would allow /session_revoke, which forever revokes the session (early; otherwise it will self-revoke when the validity period expires)
	if (tokensForAuth.has(validator.id)) {
		return Promise.resolve(tokensForAuth.get(validator.id))
	}

	const payload = {
		id: validator.id,
		era: Math.floor(Date.now() / 60000)
	}
	return ewt.sign(wallet, payload).then(function(token) {
		tokensForAuth.set(validator.id, token)
		return token
	})
}

// ~350ms for 100k operations; takes minutes to do it w/o cache
// const work = () => getAuthFor({ id: whoami() }).then(t => sessionFromToken(t))
// const start = Date.now()
// const argv = require('yargs').argv
// let p = init(argv).then(()=>unlock(argv))
// for (var i=0; i!=100000; i++) p = p.then(work)
// p.then(() => console.log(Date.now()-start))

// Note: some of this validation can be made generic and shared between adapters if needed
// e.g. MINIMAL_DEPOSIT, MINIMAL_FEE, CREATORS_WHITELIST
async function validateChannel(channel) {
	const ethChannel = toEthereumChannel(channel)
	const addrEq = (a, b) => a.toLowerCase() === b.toLowerCase()
	const ourValidator = channel.spec.validators.find(({ id }) => addrEq(address, id))
	assert.ok(ourValidator, 'channel is not validated by us')
	assert.equal(channel.id, ethChannel.hashHex(core.address), 'channel.id is not valid')
	assert.ok(channel.validUntil * 1000 > Date.now(), 'channel.validUntil has passed')
	if (cfg.VALIDATORS_WHITELIST && cfg.VALIDATORS_WHITELIST.length) {
		assert.ok(
			channel.spec.validators.every(
				({ id }) => addrEq(id, address) || cfg.VALIDATORS_WHITELIST.includes(id.toLowerCase())
			),
			'validators are not in the whitelist'
		)
	}
	if (cfg.CREATORS_WHITELIST && cfg.CREATORS_WHITELIST.length) {
		assert.ok(
			cfg.CREATORS_WHITELIST.includes(channel.creator.toLowerCase()),
			'channel.creator is not whitelisted'
		)
	}
	assert.ok(
		new BN(channel.depositAmount).gte(new BN(cfg.MINIMAL_DEPOSIT || 0)),
		'channel.depositAmount is less than MINIMAL_DEPOSIT'
	)
	assert.ok(
		new BN(ourValidator.fee).gte(new BN(cfg.MINIMAL_FEE || 0)),
		'channel validator fee is less than MINIMAL_FEE'
	)

	// Check the on-chain status
	const channelStatus = await core.states(ethChannel.hash(core.address))
	assert.equal(channelStatus, ChannelState.Active, 'channel is not Active on ethereum')

	// Channel is valid
	return true
}
function toEthereumChannel(channel) {
	const specHash = crypto
		.createHash('sha256')
		.update(JSON.stringify(channel.spec))
		.digest()
	return new Channel({
		creator: channel.creator,
		tokenAddr: channel.depositAsset,
		tokenAmount: channel.depositAmount,
		validUntil: channel.validUntil,
		validators: channel.spec.validators.map(v => v.id),
		spec: specHash
	})
}

/*
const IVO_MM = '0x54122C899013e2c4229e1789CFE5B17446Dae7f9'
const GOERLI_TST = '0x7af963cf6d228e564e2a0aa0ddbf06210b38615d'
async function testValidation() {
	await init({ keystoreFile: './tom.json' })
	return validateChannel({
		id: '0x078761802067f4e2d46a88437bfd75f30652d22f19252dec5355c1b28c78880f',
		creator: IVO_MM,
		depositAsset: GOERLI_TST,
		depositAmount: (10**17).toString(),
		validUntil: 1556201147,
		spec: {
			validators: [
				{ id: '0x2892f6c41e0718eeedd49d98d648c789668ca67d', url: 'https://tom.adex.network', fee: 0 },
				{ id: '0xce07cbb7e054514d590a0262c93070d838bfba2e', url: 'https://jerry.adex.network', fee: 0 },
			],
		}
	})
}
testValidation().catch(e => console.error(e))
*/

module.exports = {
	init,
	unlock,
	whoami,
	sign,
	getBalanceLeaf,
	sessionFromToken,
	getAuthFor,
	MerkleTree,
	verify,
	getSignableStateRoot,
	validateChannel
}
