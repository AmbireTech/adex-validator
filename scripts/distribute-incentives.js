#!/usr/bin/env node
/* eslint-disable no-console */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-param-reassign */
// const assert = require('assert')
const ethers = require('ethers')

const { Contract, getDefaultProvider } = ethers
// const { keccak256, defaultAbiCoder, id, bigNumberify, hexlify, Interface } = ethers.utils
const { keccak256, defaultAbiCoder, bigNumberify } = ethers.utils
// const fetch = require('node-fetch')
// const { Channel, Transaction, MerkleTree, splitSig } = require('adex-protocol-eth/js')
const stakingAbi = require('adex-protocol-eth/abi/Staking')
// const identityAbi = require('adex-protocol-eth/abi/Identity')
// const db = require('../db')
const cfg = require('../cfg')
const adapters = require('../adapters')

const ADDR_STAKING = '0x4846c6837ec670bbd1f5b485471c8f64ecb9c534'

const DISTRIBUTION_IDENTITY = '0xe3C19038238De9bcc3E735ec4968eCd45e04c837'
// const FEE_TOKEN = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
// const POOL_ID = id('validator:0x2892f6C41E0718eeeDd49D98D648C789668cA67d') // '0x2ce0c96383fb229d9776f33846e983a956a7d95844fac57b180ed0071d93bb28'

// const INCENTIVE_CHANNEL_OPEN_FEE = bigNumberify('1500000000000000000')

const provider = getDefaultProvider('homestead')
const Staking = new Contract(ADDR_STAKING, stakingAbi, provider)
/* const Identity = new Contract(DISTRIBUTION_IDENTITY, identityAbi, provider)
const Token = new Contract(
	FEE_TOKEN,
	['function balanceOf(address owner) view returns (uint)'],
	provider
)
const idInterface = new Interface(identityAbi)

const coreAddr = cfg.ETHEREUM_CORE_ADDR
*/

const ZERO = bigNumberify(0)

const keystoreFile = process.argv[2]
const keystorePwd = process.env.KEYSTORE_PWD
if (!(keystoreFile && keystorePwd)) {
	console.log(`Usage: KEYSTORE_PWD=... .${process.argv[1]} <path to keystore file>`)
	process.exit(1)
}

const adapter = new adapters.ethereum.Adapter(
	{
		keystoreFile: process.argv[2],
		keystorePwd: process.env.KEYSTORE_PWD
	},
	cfg,
	provider
)

function getBondId({ owner, amount, poolId, nonce }) {
	return keccak256(
		defaultAbiCoder.encode(
			['address', 'address', 'uint', 'bytes32', 'uint'],
			[ADDR_STAKING, owner, amount, poolId, nonce]
		)
	)
}

function addToMap(map, key, val) {
	if (!map[key]) map[key] = val
	else map[key] = map[key].add(val)
	return map
}

function getDistributionForPeriod(parsedLogs, startSeconds, endSeconds, perSecond) {
	// @TODO: implement pools
	// @TODO: implement slashing: currently since there's no slashing, it's all proportional to the total bonded amount
	// this will be kind tricky with unbonding since we have to .sub the exact post-slash amount (effectiveAmount)
	const distribution = {}
	const currentStakedByUser = {}
	const bonds = {}
	let currentTime = 0
	const tally = (start, end) => {
		const usedStart = Math.max(startSeconds, start)
		const usedEnd = Math.min(endSeconds, end)
		const delta = usedEnd - usedStart
		if (!(delta > 0)) return
		const totalStake = Object.values(currentStakedByUser).reduce((a, b) => a.add(b), ZERO)
		const totalDistribution = perSecond.mul(delta)
		for (const addr of Object.keys(currentStakedByUser)) {
			addToMap(distribution, addr, totalDistribution.mul(currentStakedByUser[addr]).div(totalStake))
		}
	}

	for (const log of parsedLogs) {
		tally(currentTime, log.values.time.toNumber())
		if (log.name === 'LogBond') {
			addToMap(currentStakedByUser, log.values.owner, log.values.amount)
			bonds[getBondId(log.values)] = log.values
		}
		if (log.name === 'LogUnbondRequested') {
			currentStakedByUser[log.values.owner] = currentStakedByUser[log.values.owner].sub(
				bonds[log.values.bondId].amount
			)
		}
		currentTime = log.values.time.toNumber()
	}
	tally(currentTime, endSeconds)

	return distribution
}

async function main() {
	console.log(`Distribution identity: ${DISTRIBUTION_IDENTITY}`)

	await adapter.init()
	await adapter.unlock()

	/*
	// Safety check: whether we have sufficient privileges
	if ((await Identity.privileges(adapter.whoami())) < 2) {
		console.log(
			`Insufficient privilege in the distribution identity (${DISTRIBUTION_IDENTITY})`
		)
		process.exit(1)
	}

	await db.connect()
	const rewardChannels = db.getMongo().collection('rewardChannels')
	*/

	// NOTE: getLogs should not have limits
	const logs = await provider.getLogs({ fromBlock: 0, address: ADDR_STAKING })
	const parsedLogs = logs.map(log => Staking.interface.parseLog(log))
	const nowSeconds = Math.floor(Date.now() / 1000)
	Object.entries(
		getDistributionForPeriod(
			parsedLogs,
			1596499200,
			Math.min(nowSeconds, 1609372800),
			bigNumberify('478927203065134100')
		)
	).forEach(([addr, tokens]) => console.log(addr, tokens.toString(10)))

	process.exit(0)
}

main().catch(e => {
	console.error(e)
	process.exit(1)
})
