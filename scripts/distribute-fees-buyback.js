#!/usr/bin/env node
/* eslint-disable no-console */

// NB: this script is symlink and executed as `distribute-rewards.js`
const ethers = require('ethers')

const { Contract } = ethers
const { hexlify, formatUnits, bigNumberify } = ethers.utils
const fetch = require('node-fetch')
const throttle = require('lodash.throttle')
const qs = require('querystring')
const identityAbi = require('adex-protocol-eth/abi/Identity')
const { Transaction, splitSig } = require('adex-protocol-eth/js')

const cfg = require('../cfg')
const adapters = require('../adapters')

const { provider } = require('./lib')

const DISTRIBUTION_IDENTITY = '0xe3C19038238De9bcc3E735ec4968eCd45e04c837'
const FEE_TOKEN = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
const MIN_BUYBACK = bigNumberify('500000000000000000000')

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
	homestead: '0xB6456b57f03352bE48Bf101B46c1752a0813491a',
	ropsten: '',
	goerli: '0xB6456b57f03352bE48Bf101B46c1752a0813491a'
}

const PUSHOVER_URL = 'https://api.pushover.net/1/messages.json'

const notify = throttle(message => {
	console.log(message)
	if (cfg.ETHEREUM_NETWORK === 'goerli') {
		return
	}
	const token = process.env.PUSHOVER_TOKEN
	const user = process.env.PUSHOVER_USER
	const body = qs.stringify({ token, user, message: `${cfg.ETHEREUM_NETWORK}: ${message}` })

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

const stakingPoolAddress = STAKING_POOL_ADDRESSES[cfg.ETHEREUM_NETWORK]
const { dai, weth, adx } = ADDRESSES[cfg.ETHEREUM_NETWORK]
const Identity = new Contract(DISTRIBUTION_IDENTITY, identityAbi, provider)

const uniswapRouterContractAddress = UNISWAP_V2_02_ROUTER_ADDRESSES[cfg.ETHEREUM_NETWORK]

const uniswapV2Router = new Contract(
	uniswapRouterContractAddress,
	[
		`function getAmountsOut(uint amountIn, address[] path) external view returns (uint[] amounts)`,
		`function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) external`
	],
	provider
)

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

async function estimateTxCostRequiredInDAI(txns = [], sigs = [], nonce, deadline) {
	const [uniswapTradeTxRaw, txSig] = await estimateUniswapTradeGasCostInDAI(nonce, deadline)

	// estimate transaction cost
	const estimatedGasRequired = await Identity.estimate.execute(
		txns.concat([uniswapTradeTxRaw]).map(t => new Transaction(t).toSolidityTuple()),
		sigs.concat([txSig])
	)
	// the multiple invokations of the CALL opcode in execute() sometimes
	// cause gas estimations to be a bit lower than what's actually required
	const gasLimit = estimatedGasRequired.add(20000)
	const currentGasPrice = await provider.getGasPrice()
	const totalTxAmountInETH = gasLimit.mul(currentGasPrice)
	const [, txFeeAmountInDAI] = await uniswapV2Router.getAmountsOut(totalTxAmountInETH, [weth, dai])

	return txFeeAmountInDAI
}

async function estimateUniswapTradeGasCostInDAI(nonce, tradeDeadline) {
	const mockDaiAmountToTrade = bigNumberify(1000).mul(bigNumberify(10).pow(18))
	const [, , estimatedADXForDAI] = await uniswapV2Router.getAmountsOut(mockDaiAmountToTrade, [
		dai,
		weth,
		adx
	])
	const uniswapTradeTxRaw = {
		identityContract: DISTRIBUTION_IDENTITY,
		nonce,
		feeTokenAddr: FEE_TOKEN,
		feeAmount: 0,
		to: uniswapV2Router.address,
		data: hexlify(
			uniswapV2Router.interface.functions.swapExactTokensForTokens.encode([
				// we use demo values to get gas cost estimate
				mockDaiAmountToTrade,
				estimatedADXForDAI,
				[dai, weth, adx],
				stakingPoolAddress,
				tradeDeadline
			])
		)
	}

	const uniswapTradeTx = new Transaction(uniswapTradeTxRaw)
	const txSig = splitSig(await adapter.sign(uniswapTradeTx.hash()))

	return [uniswapTradeTxRaw, txSig]
}

async function main() {
	console.log(`Distribution identity: ${DISTRIBUTION_IDENTITY}`)

	await adapter.init()
	await adapter.unlock()

	if (!dai) throw new Error('Invalid $DAI address')
	if (!weth) throw new Error('Invalid $WETH address')
	if (!adx) throw new Error('Invalid $ADX address')
	if (!stakingPoolAddress) throw new Error('Invalid StakingPool address')

	// dai is 18 decimal places
	const daiContract = new ethers.Contract(
		dai,
		[
			`function approve(address spender, uint amount) returns (bool)`,
			`function allowance(address owner, address spender) view returns (uint)`,
			'function balanceOf(address owner) view returns (uint)'
		],
		provider
	)

	// current block timestamp + 7200 secs (2 hr)
	const tradeDeadline = (await provider.getBlock('latest')).timestamp + 60 * 60 * 2
	const totalDaiAmountToTrade = await daiContract.balanceOf(DISTRIBUTION_IDENTITY)
	if (totalDaiAmountToTrade.lt(MIN_BUYBACK)) {
		console.log('Incurred DAI reward is under the minimum')
		process.exit(0)
	}
	// check the allowance of the dai
	const allowance = await daiContract.allowance(DISTRIBUTION_IDENTITY, uniswapV2Router.address)

	const transactions = {
		signatures: [],
		rawTx: []
	}

	let nonce = (await Identity.nonce()).toNumber()

	if (allowance.lt(totalDaiAmountToTrade)) {
		// identity uniswap trade transaction
		// approve uniswap to spend
		const uniswapApproveTxRaw = {
			identityContract: DISTRIBUTION_IDENTITY,
			// eslint-disable-next-line no-plusplus
			nonce: nonce++,
			feeTokenAddr: FEE_TOKEN,
			feeAmount: '5000000000000000000',
			to: daiContract.address,
			data: hexlify(
				daiContract.interface.functions.approve.encode([
					uniswapV2Router.address,
					ethers.constants.MaxUint256
				])
			)
		}

		const uniswapApproveTx = new Transaction(uniswapApproveTxRaw)
		const txSig = splitSig(await adapter.sign(uniswapApproveTx.hash()))

		transactions.signatures.push(txSig)
		transactions.rawTx.push(uniswapApproveTxRaw)
	}

	const estimatedTxCostInDAI = await estimateTxCostRequiredInDAI(
		transactions.rawTx,
		transactions.signatures,
		nonce,
		tradeDeadline
	)
	const daiAmountToTrade = totalDaiAmountToTrade
		.sub(estimatedTxCostInDAI)
		// this is added on top of the total estimatedTxCostInDAI, only in case of a first approval
		.sub(transactions.rawTx[0] ? transactions.rawTx[0].feeAmount : 0)
	const formattedDAIAmountToTrade = formatUnits(daiAmountToTrade, 18)
	const [, , estimatedADXForDAI] = await uniswapV2Router.getAmountsOut(daiAmountToTrade, [
		dai,
		weth,
		adx
	])

	// slippage tolerance of 5% (0.05)
	const amountOutMin = estimatedADXForDAI.sub(estimatedADXForDAI.mul(5).div(100))
	const formattedEstimatedADXForDAI = formatUnits(amountOutMin, 18)

	console.log(
		`Trading ${formattedDAIAmountToTrade} DAI for ${formattedEstimatedADXForDAI} ADX on Uniswap`
	)

	const uniswapTradeTxRaw = {
		identityContract: DISTRIBUTION_IDENTITY,
		nonce,
		feeTokenAddr: FEE_TOKEN,
		feeAmount: estimatedTxCostInDAI.toString(),
		to: uniswapV2Router.address,
		data: hexlify(
			uniswapV2Router.interface.functions.swapExactTokensForTokens.encode([
				daiAmountToTrade,
				amountOutMin,
				[dai, weth, adx],
				stakingPoolAddress,
				tradeDeadline
			])
		)
	}

	const uniswapTradeTx = new Transaction(uniswapTradeTxRaw)
	const txSig = splitSig(await adapter.sign(uniswapTradeTx.hash()))
	transactions.signatures.push(txSig)
	transactions.rawTx.push(uniswapTradeTxRaw)

	// console.log(transactions)

	await relayerPost(`/identity/${DISTRIBUTION_IDENTITY}/execute`, {
		signatures: transactions.signatures,
		txnsRaw: transactions.rawTx
	})

	notify(
		`Fees buyback with ${DISTRIBUTION_IDENTITY}: Traded ${formattedDAIAmountToTrade} DAI for ${formattedEstimatedADXForDAI} ADX on Uniswap`
	)
}

main()
	.then(() => {
		process.exit(0)
	})
	.catch(e => {
		console.error(e)
		process.exit(1)
	})
