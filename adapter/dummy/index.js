const { MerkleTree, Channel } = require('adex-protocol-eth/js')

function init() {
	return Promise.resolve()
}

function whoami() {
	if (!process.env.TEST_IDENTITY) {
		console.error('using dummy adapter! please run with TEST_IDENTITY=awesomeLeader (or awesomeFollower)')
		process.exit(1)
	}
	return process.env.TEST_IDENTITY
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
