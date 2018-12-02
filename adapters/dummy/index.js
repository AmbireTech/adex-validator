const { MerkleTree, Channel } = require('adex-protocol-eth/js')

const db = require('../../db')

let identity

function init(opts) {
	if (typeof(opts.dummyIdentity) !== 'string') throw 'dummy adapter: identity required'
	identity = opts.dummyIdentity
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
	const sessionCol = db.getMongo().collection('sessions')
	return sessionCol.findOne({ _id: token })
}
function getAuthFor(validator) {
	// NOTE: for this to work, we need the sessions created in the database beforehand
	return Promise.resolve(`AUTH_${whoami()}`)
}

module.exports = { init, whoami, sign, getBalanceLeaf, sessionFromToken, getAuthFor, MerkleTree }
