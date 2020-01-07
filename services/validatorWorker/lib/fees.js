const assert = require('assert')
const BN = require('bn.js')
const toBalancesKey = require('../../toBalancesKey')

function getBalancesAfterFeesTree(balances, channel) {
	const depositAmount = new BN(channel.depositAmount, 10)
	const totalDistributed = Object.values(balances)
		.map(v => new BN(v, 10))
		.reduce((a, b) => a.add(b), new BN(0))
	const totalValidatorFee = channel.spec.validators
		.map(v => new BN(v.fee, 10))
		.reduce((a, b) => a.add(b), new BN(0))

	assert.ok(totalValidatorFee.lte(depositAmount), 'total fees <= deposit: fee constraint violated')
	assert.ok(totalDistributed.lte(depositAmount), 'distributed <= deposit: OUTPACE rule #4')

	const depositToDistribute = depositAmount.sub(totalValidatorFee)

	// the sum of all validator fees / totalValidatorFee is always equal to
	// the sum of all balances / total deposit
	const balancesAfterFees = {}
	let total = new BN(0)
	// Multiply all balances by the proportion of (depositAmount - totalValidatorFee)/deposit,
	// so that if the entire deposit is distributed, we still have totalValidatorFee yet to distribute
	// this will distribute UP TO depositToDistribute, which is defined as depositAmount-totalValidatorFee
	// (minus the rounding error, which we'll add later)
	Object.keys(balances).forEach(acc => {
		const adjustedBalance = new BN(balances[acc], 10).mul(depositToDistribute).div(depositAmount)
		balancesAfterFees[acc] = adjustedBalance
		total = total.add(adjustedBalance)
	})
	const roundingErr = depositAmount.eq(totalDistributed)
		? depositToDistribute.sub(total)
		: new BN(0)
	assert.ok(!roundingErr.isNeg(), 'roundingErr should never be negative')

	// otherwise, we won't be able to fix the rounding error
	assert.ok(channel.spec.validators[0], 'there is a first validator')

	// And this will distribute fees to validators UP TO totalValidatorFee
	channel.spec.validators.forEach((v, idx) => {
		const fee = new BN(v.fee, 10).mul(totalDistributed).div(depositAmount)
		// BN.js always floors, that's why the math until now always results in sum(balancesAfterFees) <= sum(balances)
		// however, it might be lower, so we will fix this rounding error by assigning the rest to the first validator
		const feeWithRounding = idx === 0 ? fee.add(roundingErr) : fee
		if (feeWithRounding.gt(new BN(0))) {
			const addr = toBalancesKey(v.feeAddr || v.id)
			balancesAfterFees[addr] = (balancesAfterFees[addr] || new BN(0)).add(feeWithRounding)
		}
	})

	return balancesAfterFees
}

module.exports = { getBalancesAfterFeesTree }
