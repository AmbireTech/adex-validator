const { MerkleTree, Channel } = require('adex-protocol-eth/js')
const { Wallet, Contract, utils, getDefaultProvider, BigNumber } = require('ethers')
const coreABI = require('adex-protocol-eth/abi/OUTPACE')
const erc20ABI = require('adex-protocol-eth/abi/ERC20')

const depositorByteCode = require('adex-protocol-eth/resources/bytecode/Depositor')
const formatAddress = require('ethers').utils.getAddress
const fetch = require('node-fetch')
const util = require('util')
const assert = require('assert')
const fs = require('fs')

const readFile = util.promisify(fs.readFile)
const BN = require('bn.js')
const ewt = require('../ethereum/ewt')

// Auth tokens that we have verified (tokenId => session)
const tokensVerified = new Map()

// AUth tokens that we've generated to authenticate with someone (address => token)
const tokensForAuth = new Map()

let address = null
let keystoreJson = null
let wallet = null
// let secret = process.env.JWT_SECRET || 'test jwt secret 12345'

function Adapter(opts, cfg, ethProvider) {
	const provider = ethProvider || getDefaultProvider(cfg.ETHEREUM_NETWORK)
	const outpace = new Contract(cfg.ETHEREUM_CORE_ADDR, coreABI, provider)

	console.log('V5Adapter init')

	this.init = function() {
		assert.ok(typeof opts.keystoreFile === 'string', 'keystoreFile required')
		// assert.ok(typeof secret === 'string', 'secret required')
		// secret = opts.secret
		return readFile(opts.keystoreFile).then(json => {
			keystoreJson = json
			address = formatAddress(`0x${JSON.parse(json).address}`)
			// eslint-disable-next-line no-console
			console.log(`Ethereum address: ${this.whoami()}`)
		})
	}

	this.unlock = function() {
		assert.ok(keystoreJson != null, 'init() needs to be called before unlock()')
		assert.ok(typeof opts.keystorePwd === 'string', 'keystorePwd required')
		return Wallet.fromEncryptedJson(keystoreJson, opts.keystorePwd).then(w => {
			wallet = w
			return wallet
		})
	}

	this.whoami = function() {
		return address
	}

	this.sign = function(stateRoot) {
		assert.ok(wallet, 'unlock() must be called before sign()')
		// signMessage takes Arrayish, so Buffer too: https://docs.ethers.io/ethers.js/html/api-utils.html#arrayish
		return wallet.signMessage(stateRoot)
	}

	this.verify = function(signer, stateRoot, signature) {
		assert.ok(stateRoot, 'valid state root must be provided')
		assert.ok(signature, 'valid signature must be provided')
		assert.ok(signer, 'valid signer is required')

		const from = utils.verifyMessage(stateRoot, signature)
		return Promise.resolve(signer === from)
	}

	// Authentication tokens
	this.sessionFromToken = async function(token) {
		const tokenId = token.slice(0, -24)

		// console.log({ tokenId })
		// JWT backend token match
		if (tokensVerified.has(tokenId)) {
			// @TODO: validate era
			return tokensVerified.get(tokenId)
		}

		const backendURL = `${cfg.V5_ADAPTER_BACKEND}/dsp/account`

		try {
			const res = await fetch(backendURL, {
				headers: {
					'X-DSP-AUTH': `Bearer ${token}`
				}
			})

			const data = await res.json()

			let account = null

			// console.log({ data })

			assert.ok(typeof data.account === 'string', 'token: invalid account addr')
			account = this.getAddress(data.account)

			// console.log({ account })

			// NOTE: hax to return the backend resp, that should force the UI to refresh the token without additional code
			return { uid: account }

			// return account
		} catch (err) {
			console.log('errrrr', err)

			return { uid: null }
		}

		// EWT
		/**
		if (tokensVerified.has(tokenId)) {
			// @TODO: validate era
			return tokensVerified.get(tokenId)
		}
		const { from, payload } = await ewt.verify(token)
		if (payload.id !== this.whoami()) {
			throw new Error('token payload.id !== whoami(): token was not intended for us')
		}
		// @TODO: validate era here too
		let sess = { era: payload.era }
		if (typeof payload.identity === 'string' && payload.identity.length === 42) {
			const relayerUrl = `${cfg.ETHEREUM_ADAPTER_RELAYER}/identity/by-owner/${from}`
			const identitiesOwned = await fetch(relayerUrl).then(r => r.json())
			const privEntry = Object.entries(identitiesOwned).find(
				([k, v]) => k.toLowerCase() === payload.identity.toLowerCase() && v
			)
			if (!privEntry) throw new Error('insufficient privilege')
			sess = { uid: payload.identity, ...sess }
		} else {
			sess = { uid: from, ...sess }
		}
		tokensVerified.set(tokenId, sess)
		return sess
		 * */
	}

	this.getAuthFor = function(validator) {
		// we will self-generate a challenge to contain whoever we're authenticating to, the validity period and the current time
		// we will sign that challenge and use that, and build a complete token using the EWT (JWT subset) standard
		// we would allow /session_revoke, which forever revokes the session (early; otherwise it will self-revoke when the validity period expires)
		if (tokensForAuth.has(validator.id)) {
			return Promise.resolve(tokensForAuth.get(validator.id))
		}

		const payload = {
			id: validator.id,
			era: Math.floor(Date.now() / 60000)
		}
		return ewt.sign(wallet, payload).then(function(token) {
			tokensForAuth.set(validator.id, token)
			return token
		})
	}

	this.getDepositFor = async function(channel, depositor) {
		const ethChannel = toEthereumChannel(channel)
		const erc20 = new Contract(channel.tokenAddr, erc20ABI, provider)
		const outpaceBalance = await outpace.deposits(ethChannel.hashHex(), depositor)
		const create2Addr = this.getCreate2Address(
			cfg.ETHEREUM_CORE_ADDR,
			cfg.SWEEPER_ADDRESS,
			ethChannel,
			depositor
		)

		const create2Balance = await erc20.balanceOf(create2Addr)
		const tokenConfig = cfg.TOKEN_ADDRESS_WHITELIST[channel.tokenAddr.toLowerCase()]
		assert.ok(tokenConfig, 'token: invalid token addr')

		if (create2Balance.gt(BigNumber.from(tokenConfig.MINIMUM_DEPOSIT))) {
			return {
				total: new BN(create2Balance.add(outpaceBalance).toString()),
				stillOnCreate2: new BN(create2Balance.toString())
			}
		}

		return {
			total: new BN(outpaceBalance.toString()),
			stillOnCreate2: new BN(0)
		}
	}

	this.validateChannel = async function(channel, options) {
		console.log({ channel })
		console.log({ options })
		return true
	}
}

Adapter.prototype.getAddress = function(addr) {
	return formatAddress(addr)
}

Adapter.prototype.getBalanceLeaf = function(acc, bal) {
	return Channel.getBalanceLeaf(acc, bal)
}

Adapter.prototype.getSignableStateRoot = function(channelId, balanceRoot) {
	return Channel.getSignableStateRoot(channelId, balanceRoot)
}

Adapter.prototype.getCreate2Address = function(outpace, sweeper, ethChannel, depositor) {
	const depositorConstructorArg = utils.defaultAbiCoder.encode(
		['address', 'tuple(address,address,address,address,bytes32)', 'address'],
		[outpace, ethChannel.toSolidityTuple(), depositor]
	)
	const codeHash = utils.keccak256(`0x${depositorByteCode}${depositorConstructorArg.slice(2)}`)
	return utils.getCreate2Address(sweeper, utils.hexZeroPad('0x0', 32), codeHash)
}

Adapter.prototype.MerkleTree = MerkleTree

// Signed with a dummy private key, to authenticate for the Tom validator
// just a simple snippet to test authenticating via Identity contracts
// const tokenToTry = 'eyJ0eXBlIjoiSldUIiwiYWxnIjoiRVRIIn0.eyJpZCI6IjB4Mjg5MmY2QzQxRTA3MThlZWVEZDQ5RDk4RDY0OEM3ODk2NjhjQTY3ZCIsImlkZW50aXR5IjoiMHhhN2JmMGM2MTc5NWQ0MDhjYjVkMjI4MGNhMDNlODBiOTQ3MWVmY2JiIiwiZXJhIjoyNTkwOTU2MiwiYWRkcmVzcyI6IjB4N2IwMjQxNDQ3RGVlMjc5MDk0ZDM5MTc5M0E0NTNkRTA0YzY0MTMxMCJ9.CKcBojUprJwWMQXEEK3CYiFYKINgJz0Iq-6T7monrs4nnAB8E7e-4D4e0K3QPUjjtqrNZkGG8drCqvZu48gm7Rw'
// init(require('yargs').argv).then(() => sessionFromToken(tokenToTry)).then(console.log)

// ~350ms for 100k operations; takes minutes to do it w/o cache
// const work = () => getAuthFor({ id: whoami() }).then(t => sessionFromToken(t))
// const start = Date.now()
// const argv = require('yargs').argv
// let p = init(argv).then(()=>unlock(argv))
// for (var i=0; i!=100000; i++) p = p.then(work)
// p.then(() => console.log(Date.now()-start))

function toEthereumChannel(channel) {
	return new Channel({
		leader: channel.leader,
		follower: channel.follower,
		guardian: channel.guardian,
		tokenAddr: channel.tokenAddr,
		nonce: channel.nonce
	})
}

/*
const IVO_MM = '0x54122C899013e2c4229e1789CFE5B17446Dae7f9'
const GOERLI_TST = '0x7af963cf6d228e564e2a0aa0ddbf06210b38615d'
async function testValidation() {
	await init({ keystoreFile: './tom.json' })
	return validateChannel({
		id: '0xe3c4974fb77453a6ca13854a17c691098bc4d590e915c32a646c97a6016e3338',
		creator: IVO_MM,
		depositAsset: GOERLI_TST,
		depositAmount: (2 * 10 ** 17).toString(),
		validUntil: 1556201147,
		spec: {
			// ((10**18) * 5) / 1000
			minPerImpression: '5000000000000000',
			validators: [
				{
					id: '0x2892f6C41E0718eeeDd49D98D648C789668cA67d',
					url: 'https://tom.adex.network',
					fee: '0'
				},
				{
					id: '0xce07CbB7e054514D590a0262C93070D838bFBA2e',
					url: 'https://jerry.adex.network',
					fee: '0'
				}
			]
		}
	})
}
testValidation().catch(e => console.error(e))
*/

module.exports = {
	Adapter,
	toEthereumChannel
}
