const assert = require('assert')
const { providers, Contract, Wallet } = require('ethers')
const adexCoreAbi = require('adex-protocol-eth/abi/AdExCore.json')

const provider = new providers.JsonRpcProvider('http://localhost:8545')
// eslint-disable-next-line import/no-unresolved
const deployed = require('../mocks/deploy.json')
// eslint-disable-next-line import/no-unresolved
const tokenAbi = require('../mocks/tokenabi.json')

let core = null
let token = null

const privateKey = '0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501200'
const wallet = new Wallet(privateKey, provider)

async function channelOpen() {
	core = new Contract(deployed.adexcore, adexCoreAbi, wallet)
	token = new Contract(deployed.token, tokenAbi, wallet)

	await token.setBalanceTo(wallet.address, 2000)

	const channel = deployed.channelSolidityTuple
	channel[5] = Buffer.from(channel[5], 'hex')

	const receipt = await (await core.channelOpen(channel)).wait()

	const ev = receipt.events.find(x => x.event === 'LogChannelOpen')
	assert.ok(ev, 'Should have LogChannelOpen event')
}

channelOpen().then(function() {
	console.log(`🔥 Successfully opened channel 🔥`)
})
