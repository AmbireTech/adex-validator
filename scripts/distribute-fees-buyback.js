#!/usr/bin/env node
/* eslint-disable no-console */

// NB: this script is symlink and executed as `distribute-rewards.js`
const ethers = require('ethers')

const { Contract } = ethers
const { hexlify, formatUnits } = ethers.utils
const fetch = require('node-fetch')
const throttle = require('lodash.throttle')
const qs = require('querystring')
const identityAbi = require('adex-protocol-eth/abi/Identity')
const { Transaction, splitSig } = require('adex-protocol-eth/js')

const db = require('../db')
const cfg = require('../cfg')
const adapters = require('../adapters')

const { provider } = require('./lib')

const DISTRIBUTION_IDENTITY = '0xe3C19038238De9bcc3E735ec4968eCd45e04c837'
const FEE_TOKEN = '0x6B175474E89094C44Da98b954EedeAC495271d0F'

const keystoreFile = process.argv[2]
const keystorePwd = process.env.KEYSTORE_PWD

if (!(keystoreFile && keystorePwd)) {
	console.log(`Usage: KEYSTORE_PWD=... .${process.argv[1]} <path to keystore file>`)
	process.exit(1)
}

const UNISWAP_V2_02_ROUTER_ADDRESSES = {
	homestead: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
	goerli: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
	ropsten: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'
}

const ADDRESSES = {
	homestead: {
		dai: '0x6b175474e89094c44da98b954eedeac495271d0f',
		weth: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
		adx: '0xADE00C28244d5CE17D72E40330B1c318cD12B7c3'
	}
}

const STAKING_POOL_ADDRESSES = {
	homestead: '0xb6456b57f03352be48bf101b46c1752a0813491a',
	ropsten: '',
	goerli: '0xb6456b57f03352be48bf101b46c1752a0813491a'
}

const PUSHOVER_URL = 'https://api.pushover.net/1/messages.json'

const notify = throttle(message => {
	console.log(message)
	if (cfg.network === 'goerli') {
		return
	}
	const token = process.env.PUSHOVER_TOKEN
	const user = process.env.PUSHOVER_USER
	const body = qs.stringify({ token, user, message: `${cfg.network}: ${message}` })

	fetch(PUSHOVER_URL, {
		method: 'POST',
		body,
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
	})
}, cfg.alertsThrottle)

const adapter = new adapters.ethereum.Adapter(
	{
		keystoreFile,
		keystorePwd
	},
	cfg,
	provider
)

const stakingPoolAddress = STAKING_POOL_ADDRESSES[cfg.network]
const Identity = new Contract(DISTRIBUTION_IDENTITY, identityAbi, provider)

async function relayerPost(url, body) {
	const r = await fetch(cfg.ETHEREUM_ADAPTER_RELAYER + url, {
		headers: { 'content-type': 'application/json' },
		method: 'POST',
		body: JSON.stringify(body)
	})
	const responseBody = await r.json()
	if (r.status !== 200) throw responseBody
	return responseBody
}

async function main() {
	console.log(`Distribution identity: ${DISTRIBUTION_IDENTITY}`)

	await adapter.init()
	await adapter.unlock()

	await db.connect()

	const uniswapRouterContractAddress = UNISWAP_V2_02_ROUTER_ADDRESSES[cfg.ETHEREUM_NETWORK]

	const uniswapV2Router = new Contract(
		uniswapRouterContractAddress,
		[
			`function getAmountsOut(uint amountIn, address[] memory path) external view returns (uint[] memory amounts)`,
			`function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external`
		],
		provider
	)

	const { dai, weth, adx } = ADDRESSES[cfg.ETHEREUM_NETWORK]
	if (!dai) throw new Error('Invalid $DAI address')
	if (!weth) throw new Error('Invalid $WETH address')
	if (!adx) throw new Error('Invalid $ADX address')

	// dai is 18 decimal places
	const daiContract = new ethers.Contract(
		dai,
		[['function balanceOf(address owner) view returns (uint)']],
		provider
	)
	const daiAmountToTrade = daiContract.balanceOf(DISTRIBUTION_IDENTITY)
	const formattedDAIAmountToTrade = formatUnits(daiAmountToTrade, 18)

	const [, estimatedETHForDAI] = await uniswapV2Router.getAmountsOut(daiAmountToTrade, [dai, weth])
	const [, estimatedADXForETH] = await uniswapV2Router.getAmountsOut(estimatedETHForDAI, [
		weth,
		adx
	])

	// slippage tolerance of 20% (0.2)
	const amountOutMin = estimatedADXForETH.sub(estimatedADXForETH.mul(20).div(100))
	const formattedEstimatedADXForETH = formatUnits(amountOutMin, 18)

	console.log(
		`Trading ${formattedDAIAmountToTrade} DAI for ${formattedEstimatedADXForETH} ADX on Uniswap`
	)

	// current block timestamp + 7200 secs (2 hr)
	const tradeDeadline = (await provider.getBlock('latest')).timestamp + 60 * 60 * 2

	// identity uniswap trade transaction
	const uniswapTradeTxRaw = {
		identityContract: DISTRIBUTION_IDENTITY,
		nonce: (await Identity.nonce()).toNumber(),
		feeTokenAddr: FEE_TOKEN,
		feeAmount: 0,
		to: DISTRIBUTION_IDENTITY,
		data: hexlify(
			uniswapV2Router.functions.swapExactTokensForTokens.encode(
				daiAmountToTrade,
				amountOutMin,
				[dai, weth, adx],
				stakingPoolAddress,
				tradeDeadline
			)
		)
	}

	const uniswapTradeTx = new Transaction(uniswapTradeTxRaw)
	const txSig = splitSig(await adapter.sign(uniswapTradeTx.hash()))

	await relayerPost(`/identity/${DISTRIBUTION_IDENTITY}/execute`, {
		signatures: [txSig],
		txnsRaw: [uniswapTradeTx]
	})

	notify(
		`Fees buyback with ${DISTRIBUTION_IDENTITY}: Traded ${formattedDAIAmountToTrade} DAI for ${formattedEstimatedADXForETH} ADX on Uniswap`
	)
}

main()
	.then(() => {
		db.close()
		process.exit(0)
	})
	.catch(e => {
		console.error(e)
		process.exit(1)
	})
