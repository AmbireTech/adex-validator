const BN = require('bn.js')
const cfg = require('../../../cfg')

const HEALTH_THRESHOLD_NEG = new BN(1000 - cfg.HEALTH_THRESHOLD_PROMILLES)

// Implements constraints described at: https://github.com/AdExNetwork/adex-protocol/blob/master/OUTPACE.md#specification
function isValidTransition(channel, prev, next) {
	const sumPrev = sumMap(prev)
	const sumNext = sumMap(next)
	const depositAmount = new BN(channel.depositAmount, 10)
	return (
		sumNext.gte(sumPrev) &&
		sumNext.lte(depositAmount) &&
		Object.entries(prev).every(([acc, bal]) => {
			const nextBal = next[acc]
			if (!nextBal) return false
			return nextBal.gte(bal)
		}) &&
		Object.entries(next).every(([, bal]) => !bal.isNeg())
	)
}

function isHealthy(channel, our, approved) {
	const sumOur = sumMap(our)
	const sumApprovedMins = sumMins(our, approved)
	// division by zero can't happen here, because sumApproved >= sumOur
	// if sumOur is 0, it will always be true
	if (sumApprovedMins.gte(sumOur)) {
		return true
	}
	const depositAmount = new BN(channel.depositAmount, 10)
	const acceptableDifference = depositAmount.mul(HEALTH_THRESHOLD_NEG).div(new BN(1000))
	if (sumOur.sub(sumApprovedMins).gte(acceptableDifference)) {
		return false
	}
	return true
}

function sumBNs(bns) {
	return bns.reduce((a, b) => a.add(b), new BN(0))
}

function sumMap(all) {
	return sumBNs(Object.values(all))
}

function sumMins(our, approved) {
	// since the min(anything, non existant val) is always 0, we need to sum the mins of the intersecting keys only
	// for this, it's sufficient to iterate the keys of whichever map
	return sumBNs(Object.keys(our).map(k => BN.min(our[k], approved[k] || new BN(0))))
}

module.exports = { isValidTransition, isHealthy, sumMap }
