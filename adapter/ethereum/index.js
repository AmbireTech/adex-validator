const { MerkleTree, Channel } = require('adex-protocol-eth/js')
const { Wallet } = require('ethers')

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
	console.log('sessionFromToken TODO', token)
	// @TODO
	// this will go two ways: either we will have it in the DB and just confirm, or we will not and we will do a full evaluation
	return Promise.resolve(null)
}
function getAuthFor(validator) {
	// @TODO
	// we will self-generate a challenge to contain whoever we're authenticating to, the validity period and the current time
	// we will sign that challenge and use that, and build a complete token containing hash.whoami.challenge.sig
	// we would allow /session_revoke, which forever revokes the session (early; otherwise it will self-revoke when the validity period expires)
	// EWT/JWT is kind of similar to this, so reconsider it
	// also, we need to cache those! and maybe check them first before saving to the DB
	return Promise.resolve(`AUTH_${whoami()}`)
}

module.exports = { sessionFromToken, whoami, sign, getBalanceLeaf, getAuthFor, MerkleTree }
