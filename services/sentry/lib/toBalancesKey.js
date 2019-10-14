const assert = require('assert')

module.exports = function toBalancesKey(key) {
	if (key.startsWith('0x')) {
		// WARNING: Ethereum specific behavior
		// technical debt cause we failed to consider this on a type level
		// see https://gist.github.com/Ivshti/6d43b30ec538ba8e2ac0b8745f3d20ee
		assert.equal(Buffer.from(key.slice(2), 'hex').length, 20, 'address must be correct length')
		return key.toLowerCase()
	}
	return key
}
