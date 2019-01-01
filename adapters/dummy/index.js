const { MerkleTree, Channel } = require('adex-protocol-eth/js')

const db = require('../../db')
const dummyVals = require('../../test/prep-db/mongo')

let identity

function init(opts) {
	if (typeof(opts.dummyIdentity) !== 'string') throw 'dummy adapter: identity required'
	identity = opts.dummyIdentity
	return Promise.resolve()
}

function unlock() {
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
	if (identity === dummyVals.ids.leader) return Promise.resolve(dummyVals.auth.leader)
	else if (identity === dummyVals.ids.follower) return Promise.resolve(dummyVals.auth.follower)
	else return Promise.reject(`no auth token for this identity: ${identity}`)
}

module.exports = { init, unlock, whoami, sign, getBalanceLeaf, sessionFromToken, getAuthFor, MerkleTree }
