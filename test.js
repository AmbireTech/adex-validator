const BN = require('bn.js')

const result = new BN(3, 10)
	.mul(new BN(500, 10))
	.mul(new BN(10, 10).pow(new BN(18, 10)))
	.div(new BN(1000, 10))

console.log(result.toString(10))
console.log('3000000000000000000'.length)
