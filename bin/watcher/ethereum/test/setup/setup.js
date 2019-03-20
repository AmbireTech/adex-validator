const Web3 = require('web3')

const web3 = new Web3('http://localhost:8545')
const fs = require('fs')
const { ContractFactory } = require('ethers')
const { Channel } = require('adex-protocol-eth/js/Channel')
const adexCoreABI = require('adex-protocol-eth/abi/AdExCore.json')
const adexCore = require('adex-protocol-eth/build/contracts/AdExCore.json')
const { wallet } = require('./index')
const tokenbytecode = require('../mocks/tokenbytecode.json')
const tokenabi = require('../mocks/tokenabi.json')

let core = null
let token = null
let channel = null

// create deploy json
async function deployContracts() {
	const { bytecode } = adexCore
	core = new ContractFactory(adexCoreABI, bytecode, wallet)

	// const { abi, evm } = MockToken.contracts['Token.sol'].Token
	// const tokenbytecode = evm.bytecode.object
	token = new ContractFactory(tokenabi, tokenbytecode, wallet)

	core = await core.deploy()
	core = await core.deployed()
	token = await token.deploy()
	token = await token.deployed()

	const blockTime = (await web3.eth.getBlock('latest')).timestamp
	channel = sampleChannel(wallet.address, 2000, blockTime + 50, 0)

	// channel solidity tuple
	const tuple = channel.toSolidityTuple()
	tuple[5] = tuple[5].toString('hex')

	const data = JSON.stringify({
		adexcore: core.address,
		token: token.address,
		channelId: channel.hashHex(core.address).toString('hex'),
		channelSolidityTuple: tuple
	})

	fs.writeFileSync('./test/mocks/deploy.json', data)
}

function sampleChannel(creator, amount, validUntil, nonce) {
	// eslint-disable-next-line no-buffer-constructor
	const spec = new Buffer(32)
	spec.writeUInt32BE(nonce)
	return new Channel({
		creator,
		tokenAddr: token.address,
		tokenAmount: amount,
		validUntil,
		validators: [creator, creator],
		spec
	})
}

deployContracts().then(function() {
	console.log(`🔥 Successfully deployed contracts 🔥`)
})
