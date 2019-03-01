// parse ADexCore json file from truffle build
const AdexCore = require('adex-protocol-eth/build/contracts/AdExCore.json')
const { bytecode } = AdexCore
const abi = require('adex-protocol-eth/abi/AdExCore.json')
const fs = require('fs')
const web3 = require('web3');

let dummyVals = {
	ids: {
		leader: 'awesomeLeader',
		follower: 'awesomeFollower',
		user: 'awesomeTestUser',
		publisher: 'myAwesomePublisher',
	},
	auth: {
		leader: 'AUTH_awesomeLeader',
		follower: 'AUTH_awesomeFollower',
		user: 'x8c9v1b2',
		publisher: 'testing',
	},
	channel: {
		// @TODO: document schema
		_id: 'awesomeTestChannel',
		id: 'awesomeTestChannel',
		status: 'pending',
		depositAsset: 'DAI',
		depositAmount: 1000,
		validators: ['awesomeLeader', 'awesomeFollower'],
		spec: {
			validators: [
				{ id: 'awesomeLeader', url: 'http://localhost:8005', fee:  100 },
				{ id: 'awesomeFollower', url: 'http://localhost:8006', fee: 100 },
			]
        },
        watcher: {
            ethereum : {
                contract: '0x'
            }
        },
        created: new Date().getTime(),
	}
}

const keys = Object.keys(AdexCore.networks)
const { address, transactionHash } = AdexCore.networks[keys[0]]

const { providers, Contract, Wallet, ContractFactory } = require('ethers')

// const contract = require('truffle-contract')
// const Token = contract(AdexCore)
// Token.setProvider(new web3.providers.HttpProvider('http://localhost:8545'))

// Token.deployed().then(function(instance){
// 	console.log(instance.address)
// })

const provider = new providers.JsonRpcProvider('http://localhost:8545');

console.log({ transactionHash })
console.log({ address })

const privateKey = `0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501200`
const wallet = new Wallet(privateKey, provider);

// console.log({ receipt })
// const { contractAddress } = receipt
// console.log({ contractAddress })
// dummyVals.channel.watcher.ethereum.contract = contractAddress;
// db.channels.insert(dummyVals.channel)
// write json to file and  use it to seed database
const seed = JSON.stringify(dummyVals.channel)

const core = new ContractFactory(abi, bytecode, wallet);

core.deploy().then(function(contract){

	contract.deployed().then(function(instance){

		console.log(`instance address `, instance.address)

			const file = `
		const data = ${seed}

		if (typeof(db) !== 'undefined') {
			db.channels.insert(data)
		}
		`

		fs.writeFileSync('./test/prep-db/seed.js', file);


	})
})


if (typeof(module) !== 'undefined') module.exports = Object.freeze(dummyVals)