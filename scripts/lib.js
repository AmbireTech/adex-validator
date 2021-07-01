const ethers = require('ethers')
// const assert = require('assert')
const cfg = require('../cfg')

const {
	INFURA_PROJECT_ID,
	LOGS_INFURA_PROJECT_ID,
	ETHERSCAN_API_TOKEN,
	WEB3_NODE_URL
} = process.env
const { network } = cfg

const provider = (() => {
	if (INFURA_PROJECT_ID) {
		return new ethers.providers.InfuraProvider(network, INFURA_PROJECT_ID)
	}
	if (ETHERSCAN_API_TOKEN) {
		return new ethers.providers.EtherscanProvider(network, ETHERSCAN_API_TOKEN)
	}
	if (WEB3_NODE_URL) {
		return new ethers.providers.JsonRpcProvider(WEB3_NODE_URL, network)
	}
	return ethers.getDefaultProvider(network)
})()

const providerLogs = LOGS_INFURA_PROJECT_ID
	? new ethers.providers.InfuraProvider(network, LOGS_INFURA_PROJECT_ID)
	: provider

// const Wallet = () => {
// 	const privateKey = process.env.PRIVATE_KEY
// 	assert.ok(privateKey, 'PRIVATE_KEY required')
// 	return new ethers.Wallet(privateKey, provider)
// }

module.exports = { provider, providerLogs }
