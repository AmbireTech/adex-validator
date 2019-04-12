const { MerkleTree, Channel } = require('adex-protocol-eth/js')
const assert = require('assert')
const dummyVals = require('../../test/prep-db/mongo')
const lib = require('../lib')

let identity = null

// eslint-disable-next-line no-unused-vars
function Adapter(opts, cfg) {
	this.init = function() {
		assert.ok(typeof opts.dummyIdentity === 'string', 'dummyIdentity required')
		identity = opts.dummyIdentity
		return Promise.resolve()
	}

	this.unlock = function() {
		return Promise.resolve()
	}

	this.whoami = function() {
		return identity
	}

	this.sign = function(stateRoot) {
		return Promise.resolve(
			`Dummy adapter signature for ${stateRoot.toString('hex')} by ${this.whoami()}`
		)
	}

	this.verify = function(signer, stateRoot, signature) {
		/**
		 * Sample signature
		 * `Dummy adapter for 6def5a300acb6fcaa0dab3a41e9d6457b5147a641e641380f8cc4bf5308b16fe by awesomeLeader`
		 *
		 */
		const splitSig = signature.split(' ')
		const from = splitSig[splitSig.length - 1]

		return Promise.resolve(signer === from)
	}

	this.validateChannel = async function(channel) {
		await lib.isChannelValid(channel, identity)
		return parseInt(channel.depositAmount, 10) > 0
	}

	// Authentication tokens
	this.sessionFromToken = function(token) {
		const who = Object.entries(dummyVals.auth).find(v => v[1] === token)
		if (who) return Promise.resolve({ uid: dummyVals.ids[who[0]] })
		return Promise.resolve(null)
	}

	this.getAuthFor = function() {
		const who = Object.entries(dummyVals.ids).find(v => v[1] === identity)
		if (who) return Promise.resolve(dummyVals.auth[who[0]])
		return Promise.reject(new Error(`no auth token for this identity: ${identity}`))
	}
}

function getBalanceLeaf(acc, bal) {
	return Channel.getBalanceLeaf(acc, bal)
}

function getSignableStateRoot(channelId, balanceRoot) {
	return Channel.getSignableStateRoot(Buffer.from(channelId), balanceRoot)
}

module.exports = {
	Adapter,
	getBalanceLeaf,
	MerkleTree,
	getSignableStateRoot
}
