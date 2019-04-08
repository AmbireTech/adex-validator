const { MerkleTree, Channel, ChannelState } = require('adex-protocol-eth/js')
const { Wallet, Contract, utils, getDefaultProvider } = require('ethers')
const coreABI = require('adex-protocol-eth/abi/AdExCore')
const identityABI = require('adex-protocol-eth/abi/Identity')
const formatAddress = require('ethers').utils.getAddress
const util = require('util')
const assert = require('assert')
const fs = require('fs')
const crypto = require('crypto')

const readFile = util.promisify(fs.readFile)
const cfg = require('../../cfg')
const lib = require('../lib')
const ewt = require('./ewt')

const provider = getDefaultProvider(cfg.ETHEREUM_NETWORK)
const core = new Contract(cfg.ETHEREUM_CORE_ADDR, coreABI, provider)

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

	const from = utils.verifyMessage(stateRoot, signature)
	return Promise.resolve(signer === from)
}

function getBalanceLeaf(acc, bal) {
	return Channel.getBalanceLeaf(acc, bal)
}

// Authentication tokens
async function sessionFromToken(token) {
	const tokenId = token.slice(0, -16)
	if (tokensVerified.has(tokenId)) {
		// @TODO: validate era
		return Promise.resolve(tokensVerified.get(tokenId))
	}
	const { from, payload } = await ewt.verify(token)
	if (payload.id !== whoami()) {
		return Promise.reject(new Error('token payload.id !== whoami(): token was not intended for us'))
	}
	// @TODO: validate era here too
	let sess = { era: payload.era }
	if (typeof payload.identity === 'string' && payload.identity.length === 42) {
		const id = new Contract(payload.identity, identityABI, provider)
		const privLevel = await id.privileges(from)
		if (privLevel === 0) return Promise.reject(new Error('insufficient privilege'))
		sess = { uid: payload.identity, ...sess }
	} else {
		sess = { uid: from, ...sess }
	}
	tokensVerified.set(tokenId, sess)
	return sess
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

// Signed with a dummy private key, to authenticate for the Tom validator
// just a simple snippet to test authenticating via Identity contracts
// const tokenToTry = 'eyJ0eXBlIjoiSldUIiwiYWxnIjoiRVRIIn0.eyJpZCI6IjB4Mjg5MmY2QzQxRTA3MThlZWVEZDQ5RDk4RDY0OEM3ODk2NjhjQTY3ZCIsImlkZW50aXR5IjoiMHhhN2JmMGM2MTc5NWQ0MDhjYjVkMjI4MGNhMDNlODBiOTQ3MWVmY2JiIiwiZXJhIjoyNTkwOTU2MiwiYWRkcmVzcyI6IjB4N2IwMjQxNDQ3RGVlMjc5MDk0ZDM5MTc5M0E0NTNkRTA0YzY0MTMxMCJ9.CKcBojUprJwWMQXEEK3CYiFYKINgJz0Iq-6T7monrs4nnAB8E7e-4D4e0K3QPUjjtqrNZkGG8drCqvZu48gm7Rw'
// init(require('yargs').argv).then(() => sessionFromToken(tokenToTry)).then(console.log)

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
	assert.ok(
		channel.spec.validators.every(({ id }) => id === formatAddress(id)),
		'channel.validators: all addresses are checksummed'
	)

	await lib.isChannelValid(channel, address).catch(function(err) {
		throw err
	})

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
		id: '0xe3c4974fb77453a6ca13854a17c691098bc4d590e915c32a646c97a6016e3338',
		creator: IVO_MM,
		depositAsset: GOERLI_TST,
		depositAmount: (2 * 10 ** 17).toString(),
		validUntil: 1556201147,
		spec: {
			// ((10**18) * 5) / 1000
			minPerImpression: '5000000000000000',
			validators: [
				{
					id: '0x2892f6C41E0718eeeDd49D98D648C789668cA67d',
					url: 'https://tom.adex.network',
					fee: '0'
				},
				{
					id: '0xce07CbB7e054514D590a0262C93070D838bFBA2e',
					url: 'https://jerry.adex.network',
					fee: '0'
				}
			]
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
