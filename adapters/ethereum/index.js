const { MerkleTree, Channel } = require('adex-protocol-eth/js')
const { Wallet } = require('ethers')
const formatAddress = require('ethers').utils.getAddress
const util = require('util')
const fs = require('fs')
const readFile = util.promisify(fs.readFile)
const ewt = require('./ewt')

// Tokens that we have verified (tokenId => session)
const tokensVerified = new Map()

// Tokens that we've generated to authenticate with someone (address => token)
const tokensForAuth = new Map()

let address = null
let keystoreJson = null
let wallet = null

function init(opts) {
	if (typeof(opts.keystoreFile) !== 'string') throw 'ethereum adapter: keystoreFile required'
	return readFile(opts.keystoreFile)
	.then(json => {
		keystoreJson = json
		address = formatAddress('0x'+JSON.parse(json).address)
		console.log(`Ethereum address: ${whoami()}`)
	})

}

function unlock(opts) {
	if (keystoreJson === null) throw 'call init() first'
	if (typeof(opts.keystorePwd) !== 'string') throw 'ethereum adapter: keystorePwd required'
	return Wallet.fromEncryptedJson(keystoreJson, opts.keystorePwd)
	.then(w => {
		wallet = w
	})

}

function whoami() {
	return address
}

function sign(stateRoot) {
	// signMessage takes Arrayish, so Buffer too: https://docs.ethers.io/ethers.js/html/api-utils.html#arrayish
	return wallet.signMessage(stateRoot)
}

function getBalanceLeaf(acc, bal) {
	return Channel.getBalanceLeaf(acc, bal)
}

// Authentication tokens
function sessionFromToken(token) {
	// @TODO: should we perform prior validation here? we can also just make ewt.verify stronger
	const tokenId = token.slice(0, -16)
	if (tokensVerified.has(tokenId)) {
		// @TODO: validate era
		return Promise.resolve(tokensVerified.get(tokenId))
	}
	return ewt.verify(token)
	.then(function({ from, payload }) {
		if (payload.id !== whoami()) {
			return Promise.reject(new Error('token payload.id !== whoami(): token was not intended for us'))
		}
		// @TODO: validate era too
		const sess = { uid: from, era: payload.era }
		tokensVerified.set(tokenId, sess)
		return sess
	})
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
		era: Math.floor(Date.now()/60000),
	}
	return ewt.sign(wallet, payload)
	.then(function(token) {
		tokensForAuth.set(validator.id, token)
		return token
	})
}

// ~350ms for 100k operations; takes minutes to do it w/o cache
//const work = () => getAuthFor({ id: whoami() }).then(t => sessionFromToken(t))
//const start = Date.now()
//const argv = require('yargs').argv
//let p = init(argv).then(()=>unlock(argv))
//for (var i=0; i!=100000; i++) p = p.then(work)
//p.then(() => console.log(Date.now()-start))

module.exports = { init, unlock, whoami, sign, getBalanceLeaf, sessionFromToken, getAuthFor, MerkleTree }