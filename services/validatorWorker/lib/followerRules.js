const BN = require('bn.js')
const cfg = require('../../../cfg')
const HEALTH_THRESHOLD = new BN(cfg.HEALTH_THRESHOLD_PROMILLES)

// Implements constraints described at: https://github.com/AdExNetwork/adex-protocol/blob/master/OUTPACE.md#specification
function isValidTransition(channel, prev, next) {
	const sumPrev = sumMap(prev)
	const sumNext = sumMap(next)
	return sumNext.gte(sumPrev)
		&& sumNext.lte(new BN(channel.depositAmount))
		&& Object.entries(prev).every(([acc, bal]) => {
			const nextBal = next[acc]
			if (!nextBal) return false
			return nextBal.gte(bal)
		})
		&& Object.entries(next).every(([acc, bal]) => !bal.isNeg())
}

function getHealth(channel, our, approved) {
	const sumOur = sumMap(our)
	const sumApprovedMins = sumMins(our, approved)
	// division by zero can't happen here, because sumApproved >= sumOur
	// if sumOur is 0, it will always be true
	if (sumApprovedMins.gte(sumOur)) {
		return 'HEALTHY'
	}
	if (sumApprovedMins.mul(new BN(1000)).div(sumOur).lt(HEALTH_THRESHOLD)) {
		return 'UNHEALTHY'
	}
	return 'HEALTHY'
}

function sumBNs(bns) {
	return bns.reduce((a,b) => a.add(b), new BN(0))
}

function sumMap(all) {
	return sumBNs(Object.values(all))
}

function sumMins(our, approved) {
	// since the min(anything, non existant val) is always 0, we need to sum the mins of the intersecting keys only
	// for this, it's sufficient to iterate the keys of whichever map
	return sumBNs(Object.keys(our).map(k => BN.min(our[k], approved[k] || new BN(0))))
}

module.exports = { isValidTransition, getHealth }
