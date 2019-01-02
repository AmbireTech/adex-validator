const { MerkleTree, Channel } = require('adex-protocol-eth/js')
const assert = require('assert')
const dummyVals = require('../../test/prep-db/mongo')

let identity = null

function init(opts) {
	assert.ok(typeof(opts.dummyIdentity) == 'string', 'dentity required')
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
	const who = Object.entries(dummyVals.auth).find(v => v[1] == token)
	if (who) return Promise.resolve({ uid: dummyVals.ids[who[0]] })
	else return Promise.resolve(null)
}
function getAuthFor(validator) {
	const who = Object.entries(dummyVals.ids).find(v => v[1] == identity)
	if (who) return Promise.resolve(dummyVals.auth[who[0]])
	else return Promise.reject(`no auth token for this identity: ${identity}`)
}

module.exports = { init, unlock, whoami, sign, getBalanceLeaf, sessionFromToken, getAuthFor, MerkleTree }
