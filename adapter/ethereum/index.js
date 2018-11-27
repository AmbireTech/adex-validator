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
	return Promise.resolve(null)
}
function getAuthFor(validator) {
	// @TODO
	return Promise.resolve(`AUTH_${whoami()}`)
}

module.exports = { sessionFromToken, whoami, sign, getBalanceLeaf, getAuthFor, MerkleTree }
