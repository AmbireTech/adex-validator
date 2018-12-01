const { MerkleTree, Channel } = require('adex-protocol-eth/js')
const { Wallet } = require('ethers')
const url = require('url')
const ewt = require('./ewt')

// Tokens that we have verified (tokenId => session)
const tokensVerified = new Map()

// Tokens that we've generated to authenticate with someone (address => token)
const tokensForAuth = new Map()

// @TODO some relatively secure & persistent way to initialize this wallet; there is fromEncryptedJson, fromMnemonic
const wallet = Wallet.createRandom()
console.log(`Ethereum address: ${whoami()}`)

function whoami() {
	return wallet.address
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
	// @TODO: should we perform prior validation here?
	const tokenId = token.slice(0, -16)
	if (tokensVerified.has(tokenId)) {
		return Promise.resolve(tokensVerified.get(tokenId))
	}
	return ewt.verify(token)
	.then(function(uid) {
		const sess = { uid }
		tokensVerified.set(tokenId, sess)
		return sess
	})
}

function getAuthFor(validator) {
	// we will self-generate a challenge to contain whoever we're authenticating to, the validity period and the current time
	// we will sign that challenge and use that, and build a complete token containing hash.whoami.challenge.sig
	// we would allow /session_revoke, which forever revokes the session (early; otherwise it will self-revoke when the validity period expires)
	// EWT/JWT is kind of similar to this, so reconsider it
	// also, we need to cache those! and maybe check them first before saving to the DB
	if (tokensForAuth.has(validator.id)) {
		return Promise.resolve(tokensForAuth.get(validator.id))
	}

	const payload = {
		host: url.parse(validator.url).host,
		era: Math.floor(Date.now()/60000),
	}
	return ewt.sign(wallet, payload)
	.then(function(token) {
		tokensForAuth.set(validator.id, token)
		return token
	})
}

//const p = () => getAuthFor({ url: 'http://localhost:8005' }).then(t => sessionFromToken(t)).then(x => console.log(x))

module.exports = { sessionFromToken, whoami, sign, getBalanceLeaf, getAuthFor, MerkleTree }
