const BN = require('bn.js')

// in promilles
const HEALTH_THRESHOLD = new BN(950)

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
}

function getHealth(channel, our, approved) {
	const sumOur = sumMap(our)
	const sumApproved = sumMap(approved)
	// division by zero can't happen here, because sumApproved >= sumOur
	// if sumOur is 0, it will always be true
	if (sumApproved.gte(sumOur)) {
		return 'HEALTHY'
	}
	if (sumApproved.mul(new BN(1000)).div(sumOur).lt(HEALTH_THRESHOLD)) {
		return 'UNHEALTHY'
	}
	return 'HEALTHY'
}

function sumMap(all) {
	return Object.values(all).reduce((a,b) => a.add(b), new BN(0))
}

module.exports = { isValidTransition, getHealth }
