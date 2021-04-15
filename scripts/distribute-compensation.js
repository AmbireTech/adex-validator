#!/usr/bin/env node
/* eslint-disable no-console */

const fetch = require('node-fetch')
const multicall = require('@makerdao/multicall')
const BN = require('bn.js')

const DISTRIBUTION_IDENTITY = '0xe3C19038238De9bcc3E735ec4968eCd45e04c837'
// v5 channel id
// const V5_CHANNEL_ID = process.env.CHANNEL_ID || '0x1'

const db = require('../db')
const cfg = require('../cfg')

const v4ChannelDataFetch = url => fetch(`${cfg.V4_VALIDATOR_URL}${url}`)

async function main() {
	console.log(`Distribution identity: ${DISTRIBUTION_IDENTITY}`)

	await db.connect()

	// fetch the channel list
	const { channels } = await (await fetch(`${cfg.V4_VALIDATOR_URL}/channel/list`)).json()

	const balances = await Promise.all(channels.map(channel => processChannel(channel)))

	const remainingBalancesMap = {}

	let totalAmountToDeposit = new BN(0)
	balances.forEach(channelBalances => {
		if (!channelBalances) return
		// console.log({ channelBalances })
		// console.log(channelBalances.results.transformed)
		Object.entries(channelBalances.results.transformed).forEach(([user, balance]) => {
			remainingBalancesMap[user] = (remainingBalancesMap[user] || new BN(0)).add(balance)
			totalAmountToDeposit = totalAmountToDeposit.add(balance)
		})
	})

	// @TODO relayer post deposit into channel
	// @TODO v5 channel create
	// @TODO store spender aggregate in database
}

async function processChannel(channel) {
	const { lastApproved } = await (await v4ChannelDataFetch(
		`/channel/${channel.id}/last-approved`
	)).json()

	if (!lastApproved) return Promise.resolve(null)

	const {
		newState: {
			msg: { balances }
		}
	} = lastApproved

	// we do multicall here to prevent performing mulitple
	// calls to infura
	const calls = Object.entries(balances).map(([user, balance]) => {
		return {
			target: cfg.ETHEREUM_CORE_ADDR,
			call: ['withdrawnPerUser(bytes32,address)(uint256)', channel.id, user],
			returns: [[user, val => new BN(balance).sub(new BN(val.toString()))]]
		}
	})
	return fetchChannelWithdrawn(calls)
}

async function fetchChannelWithdrawn(calls) {
	const config = {
		preset: 'mainnet',
		rpcUrl: 'https://mainnet.infura.io/v3/ca77f7a6c66c4ced859f74644e3ea9a4',
		multicallAddress: '0xeefba1e63905ef1d7acba5a8513c70307c1ce441'
	}
	return multicall.aggregate(calls, config)
}

main().catch(e => {
	console.error(e)
	process.exit(1)
})
