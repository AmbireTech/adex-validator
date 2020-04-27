const BN = require('bn.js')

function sumBNValues(obj = {}) {
	return Object.values(obj)
		.map(x => new BN(x, 10))
		.reduce((a, b) => a.add(b), new BN(0))
}

module.exports = { sumBNValues }
