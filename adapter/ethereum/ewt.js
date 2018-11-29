const base64 = require('base64url')

// see https://github.com/ethereum/EIPs/issues/1341

const HEADER = base64.encode(JSON.stringify({
	type: 'JWT',
	alg: 'ETH',
}))

// signer is always etherjs Wallet: https://docs.ethers.io/ethers.js/html/api-wallet.html
// .address is always checksummed
function sign(signer, payload) {
	const payloadEncoded = base64.encode(JSON.stringify({
		...payload,
		address: signer.address,
	}))
	return signer.signMessage(`${HEADER}.${payloadEncoded}`)
	.then(function(sig) {
		const sigBuf = Buffer.from(sig.slice(2), 'hex')
		return `${HEADER}.${payloadEncoded}.${base64.encode(sigBuf)}`
	})
}

function verify(token, token) {
	
}

module.exports = { sign, verify }
