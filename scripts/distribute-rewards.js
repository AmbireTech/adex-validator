#!/usr/bin/env node
const ethers = require('ethers')

const { Contract, getDefaultProvider } = ethers
const STAKING_ABI = require('adex-protocol-eth/abi/Staking')

const cfg = require('../cfg')

// Staking started on 28-12-2019
const STAKING_START_MONTH = new Date('01-01-2020')
const ADDR_STAKING = '0x46ad2d37ceaee1e82b70b867e674b903a4b4ca32'

const provider = getDefaultProvider('homestead')
const Staking = new Contract(ADDR_STAKING, STAKING_ABI, provider)

// Not needed if we simply get the revenue of feeAddr
// maybe just the whole fee + minimum "base"

// consider using the adapter for opening the keystore
// we just need to sign technically, so it should be good!

// also we'll use the sentryUrl to get stats

// cfg relayer would also be useful
console.log(cfg.ETHEREUM_ADAPTER_RELAYER)

// Produce all intervals: monthly
const getNextMonth = n =>
	n.getMonth() === 11
		? new Date(n.getFullYear() + 1, 0, 1)
		: new Date(n.getFullYear(), n.getMonth() + 1, 1)
const now = new Date()
let start = new Date(STAKING_START_MONTH)
const intervals = []
while (true) {
	// Current month is not over, so it's not included
	if (start.getFullYear() === now.getFullYear() && start.getMonth() === now.getMonth()) break
	const next = getNextMonth(start)
	intervals.push({ start, end: next })
	start = next
}

console.log(intervals)
console.log(Staking)
