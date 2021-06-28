const assert = require('assert')
const { ContractFactory, Contract, Wallet, providers } = require('ethers')

const outpaceABI = require('adex-protocol-eth/abi/OUTPACE')
const outpaceBytecode = require('adex-protocol-eth/resources/bytecode/OUTPACE')
const sweeperABI = require('adex-protocol-eth/abi/Sweeper')
const sweeperBytecode = require('adex-protocol-eth/resources/bytecode/Sweeper')
const tokenbytecode = require('./token/tokenbytecode.json')
const tokenabi = require('./token/tokenabi.json')

const dummyVals = require('../prep-db/mongo')

const provider = new providers.JsonRpcProvider('http://localhost:8545')

let core = null
let token = null
let sweeper = null

// the private keys used in starting the ganache cli instance
const wallet = new Wallet(
	'0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501200',
	provider
)
// const wallet2 = new Wallet(
// 	'0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501201',
// 	provider
// )

async function deployContracts() {
	// if contracts have been deployed return
	if (core) return { core, token }
	core = new ContractFactory(outpaceABI, outpaceBytecode, wallet)
	token = new ContractFactory(tokenabi, tokenbytecode, wallet)
	sweeper = new ContractFactory(sweeperABI, sweeperBytecode, wallet)

	core = await core.deploy()
	core = await core.deployed()

	token = await token.deploy()
	token = await token.deployed()

	sweeper = await sweeper.deploy()
	sweeper = await sweeper.deployed()

	return { core, token, sweeper }
}

async function depositToChannel(ethChannel, recipient = wallet.address, amountToDeposit = 2000) {
	core = new Contract(core.address, outpaceABI, wallet)
	token = new Contract(token.address, tokenabi, wallet)

	await (await token.setBalanceTo(recipient, amountToDeposit)).wait()

	const receipt = await (await core.deposit(
		ethChannel.toSolidityTuple(),
		recipient,
		amountToDeposit
	)).wait()

	const ev = receipt.events.find(x => x.event === 'LogChannelDeposit')
	assert.ok(ev, 'Should have LogChannelDeposit event')
}

async function sweep(ethChannel, depositor) {
	await (await sweeper.sweep(core.address, ethChannel.toSolidityTuple(), [depositor])).wait()
}

async function sampleChannel() {
	assert.ok(token, 'deploy contracts first')
	return {
		...dummyVals.channel,
		tokenAddr: token.address
	}
}

module.exports = {
	depositToChannel,
	deployContracts,
	sampleChannel,
	sweep
}
