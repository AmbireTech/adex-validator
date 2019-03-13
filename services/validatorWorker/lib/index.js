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

function isValidRootHash(leaderRootHash, { channel, balancesAfterFees, adapter }) {
	return getStateRootHash(channel, balancesAfterFees, adapter) === leaderRootHash
}

function toBNMap(raw) {
	assert.ok(raw && typeof(raw) === 'object', 'raw map is a valid object')
	const balances = {}
	Object.entries(raw).forEach(([acc, bal]) => balances[acc] = new BN(bal, 10))
	return balances
}

function toBNStringMap(raw){
	assert.ok(raw && typeof(raw) === 'object', 'raw map is a valid object')
	const balances = {}
	Object.entries(raw).forEach(([acc, bal]) => balances[acc] = bal.toString(10))
	return balances
}


// returns BN
function getValidatorFee(publisherBalance, totalValidatorFee, depositAmount) {
	const numerator = depositAmount.sub(totalValidatorFee)
	const fee = (publisherBalance.mul(numerator)).div(depositAmount)
	return fee
}

function getBalancesAfterFeesTree(balances, channel) {
	const depositAmount = new BN(channel.depositAmount, 10)

	const totalDistributed = Object.values(balances)
		.reduce((a, b) => a.add(b), new BN(0))
	const totalValidatorFee = channel.spec.validators
		.map(v => new BN(v.fee))
		.reduce((a, b) => a.add(b), new BN(0))

	// the sum of all validator fees / totalValidatorFee is always equal to
	// the sum of all balances / total deposit
	let balancesAfterFees = {}

	Object.keys(balances).forEach((publisher) => {
		let publisherBalance = new BN(balances[publisher], 10);
		const validatorFee = getValidatorFee(publisherBalance, totalValidatorFee, depositAmount)
		publisherBalance = publisherBalance.sub(validatorFee)
		assert.ok(!publisherBalance.isNeg(), 'publisher balance should not be negative')

		balancesAfterFees[publisher] = publisherBalance
	})

	channel.spec.validators.forEach(v => {
		balancesAfterFees[v.id] = (new BN(v.fee, 10).mul(totalDistributed)).div(depositAmount)
	})
	// @TODO fix rounding errors by assigning the rest to the first validator

	console.log(balances, balancesAfterFees)
	return balancesAfterFees
}

module.exports = { getStateRootHash, isValidRootHash, toBNMap, getBalancesAfterFeesTree, toBNStringMap }
