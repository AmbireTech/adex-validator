const base64 = require('base64url')
const ethers = require('ethers')

// see https://github.com/ethereum/EIPs/issues/1341
// Implements EIP 1341: Ethereum Web Tokens

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

function verify(token) {
	const parts = token.split('.')
	const msg = parts.slice(0, 2).join('.')
	const sigBuf = Buffer.from(parts[2], 'base64')
	const recoveredAddr = ethers.utils.verifyMessage(msg, sigBuf)
	return Promise.resolve(recoveredAddr)
}

module.exports = { sign, verify }
