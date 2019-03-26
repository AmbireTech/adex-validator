const { MerkleTree, Channel, ChannelState } = require('adex-protocol-eth/js')
const { Wallet, Contract, utils, getDefaultProvider } = require('ethers')
const coreABI = require('adex-protocol-eth/abi/AdExCore')
const formatAddress = require('ethers').utils.getAddress
const util = require('util')
const assert = require('assert')
const fs = require('fs')
const crypto = require('crypto')
const readFile = util.promisify(fs.readFile)
const ewt = require('./ewt')

// @TODO get rid of hardcode
const coreAddr = '0x333420fc6a897356e69b62417cd17ff012177d2b'
const core = new Contract(coreAddr, coreABI, getDefaultProvider('goerli'))

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


async function validateChannel(channel) {
	const ethChannel = toEthereumChannel(channel)
	assert.equal(channel.id, ethChannel.hashHex(core.address), 'channel.id is not valid')
	assert.ok(channel.validUntil*1000 > Date.now(), 'channel.validUntil has passed')
	// @TODO depositAmount is positive
	// @TODO depositAmount is more than MINIMAL_DEPOSIT
	// @TODO validators: each is either === adapter.whoami() or in VALIDATORS_WHITELIST
	const channelStatus = await core.states(ethChannel.hash(core.address))
	assert.equal(channelStatus, ChannelState.Active, 'channel is active on ethereum')
}
function toEthereumChannel(channel) {
	const specHash = crypto.createHash('sha256')
		.update(JSON.stringify(channel.spec))
		.digest()
	return new Channel({
		creator: channel.creator,
		tokenAddr: channel.depositAsset,
		tokenAmount: channel.depositAmount,
		validUntil: channel.validUntil,
		validators: channel.spec.validators.map(v => v.id),
		spec: specHash,
	})
}
/*
const IVO_MM = '0x54122C899013e2c4229e1789CFE5B17446Dae7f9'
const GOERLI_TST = '0x7af963cf6d228e564e2a0aa0ddbf06210b38615d'
const FOLLOWER = '0x3209caa2ec897cdee12e859b3b4def9b8421c0ed'
async function testValidation() {
	return validateChannel({
		id: '0xd075977be2237edb6c5e5a3c687e5005adc5a889b3364bc745711f1b8e950f48',
		creator: IVO_MM,
		depositAsset: GOERLI_TST,
		depositAmount: (10**17).toString(),
		validUntil: 1556201147,
		spec: {
			validators: [
				{ id: FOLLOWER, url: 'http://localhost:8005', fee: 0 },
				{ id: FOLLOWER, url: 'http://localhost:8006', fee: 0 },
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
