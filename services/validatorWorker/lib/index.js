const assert = require('assert')
const BN = require('bn.js')

function getStateRootHash(channel, balances, adapter){
	// Note: MerkleTree takes care of deduplicating and sorting
	const elems = Object.keys(balances).map(
		acc => adapter.getBalanceLeaf(acc, balances[acc])
	)
	const tree = new adapter.MerkleTree(elems)
	const balanceRoot = tree.getRoot()
	// keccak256(channelId, balanceRoot)
	const stateRoot = adapter.getSignableStateRoot(Buffer.from(channel.id), balanceRoot).toString('hex')
	return stateRoot
}

function isValidRootHash(leaderRootHash, { channel, balances, adapter }) {
	return getStateRootHash(channel, balances, adapter) === leaderRootHash
}

function toBNMap(raw) {
	assert.ok(raw && typeof(raw) === 'object', 'raw map is a valid object')
	const balances = {}
	Object.entries(raw).forEach(([acc, bal]) => balances[acc] = new BN(bal, 10))
	return balances
}


function getBalancesAfterFeesTree(balances, channel) {
	const { depositAmount } = channel
	const leaderFee = new BN(channel.spec.validators[0].fee || 1)
	const followerFee = new BN(channel.spec.validators[1].fee || 1)

	const totalValidatorFee = leaderFee.add(followerFee)

	let currentValidatorFee = new BN(0)
	
	let balancesAfterFees = {}

	Object.keys(balances).forEach((publisher) => {
		let publisherBalance = new BN(balances[publisher], 10);
		const validatorFee = getValidatorFee(publisherBalance, totalValidatorFee, new BN(depositAmount, 10))
		publisherBalance = publisherBalance.sub(validatorFee)
		assert.ok(!publisherBalance.isNeg(), 'publisher balance should not be negative')

		currentValidatorFee.add(validatorFee)
		balancesAfterFees[publisher] = publisherBalance
	})

	return { ...balancesAfterFees, validator: currentValidatorFee }
}

function toStringMap(balances){
	assert.ok(raw && typeof(raw) === 'object', 'raw map is a valid object')
	const balances = {}
	Object.entries(raw).forEach(([acc, bal]) => balances[acc] = balances[acc].toString(10))
	return balances
}

module.exports = { getStateRootHash, isValidRootHash, toBNMap, getBalancesAfterFeesTree, toStringMap }
