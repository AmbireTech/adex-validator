const assert = require('assert')
const crypto = require('crypto')
const { ContractFactory, Contract, Wallet, providers } = require('ethers')
const formatAddress = require('ethers').utils.getAddress

const { Channel } = require('adex-protocol-eth/js')
const adexCoreABI = require('adex-protocol-eth/abi/AdExCore.json')
const adexCoreBytecode = require('adex-protocol-eth/resources/bytecode/AdExCore.json')
const tokenbytecode = require('./token/tokenbytecode.json')
const tokenabi = require('./token/tokenabi.json')
const dummyVals = require('../prep-db/mongo')

const provider = new providers.JsonRpcProvider('http://localhost:8545')
let core = null
let token = null

// the private keys used in starting the ganache cli instance
const wallet = new Wallet(
	'0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501200',
	provider
)
const wallet2 = new Wallet(
	'0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501201',
	provider
)

async function deployContracts() {
	// if contracts have been deployed return
	if (core) return { core, token }
	core = new ContractFactory(adexCoreABI, adexCoreBytecode, wallet)
	token = new ContractFactory(tokenabi, tokenbytecode, wallet)

	core = await core.deploy()
	core = await core.deployed()

	token = await token.deploy()
	token = await token.deployed()
	return { core, token }
}

async function channelOpen(channel) {
	core = new Contract(core.address, adexCoreABI, wallet)
	token = new Contract(token.address, tokenabi, wallet)

	await token.setBalanceTo(wallet.address, 2000)

	const receipt = await (await core.channelOpen(channel.toSolidityTuple())).wait()

	const ev = receipt.events.find(x => x.event === 'LogChannelOpen')
	assert.ok(ev, 'Should have LogChannelOpen event')
}

async function sampleChannel() {
	const blockTime = (await provider.getBlock('latest')).timestamp

	return {
		...dummyVals.channel,
		id: null,
		creator: wallet.address,
		depositAsset: token.address,
		depositAmount: 2000,
		validUntil: blockTime + 50,
		spec: {
			...dummyVals.channel.spec,
			minPerImpression: '1',
			withdrawPeriodStart: (blockTime + 40) * 1000,
			validators: [
				// keystore json address
				{
					id: formatAddress('0x2bdeafae53940669daa6f519373f686c1f3d3393'),
					url: 'http://localhost:8005',
					fee: '100'
				},
				{ id: wallet2.address, url: 'http://localhost:8006', fee: '100' }
			]
		}
	}
}

function toEthereumChannel(channel) {
	const specHash = crypto
		.createHash('sha256')
		.update(JSON.stringify(channel.spec))
		.digest()
	return new Channel({
		creator: channel.creator,
		tokenAddr: channel.depositAsset,
		tokenAmount: channel.depositAmount,
		validUntil: channel.validUntil,
		validators: channel.spec.validators.map(v => v.id),
		spec: specHash
	})
}

module.exports = {
	channelOpen,
	deployContracts,
	toEthereumChannel,
	sampleChannel
}
