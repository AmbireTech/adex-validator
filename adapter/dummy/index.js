const { MerkleTree, Channel } = require('adex-protocol-eth/js')

let identity

function init(opts) {
	if (typeof(opts.identity) !== 'string') throw 'dummy adapter: identity required'
	identity = opts.identity
	return Promise.resolve()
}

function whoami() {
	return identity
}

function sign(stateRoot) {
	return Promise.resolve(`Dummy adapter signature for ${stateRoot.toString('hex')} by ${whoami()}`)
}

function getBalanceLeaf(acc, bal) {
	return Channel.getBalanceLeaf(acc, bal)
}

// Authentication tokens
function sessionFromToken(token) {
	return Promise.resolve(null)
}
function getAuthFor(validator) {
	// NOTE: for this to work, we need the sessions created in the database beforehand
	return Promise.resolve(`AUTH_${whoami()}`)
}

module.exports = { init, whoami, sign, getBalanceLeaf, sessionFromToken, getAuthFor, MerkleTree }
