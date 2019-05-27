#!/usr/bin/env node
const yargs = require('yargs')
const db = require('../db').connect()
const logger = require('../services/logger')('prunning')

const { argv } = yargs
	.usage('Usage $0 [options]')
	.describe('channel', 'the channel to delete from')
	.describe('threshold', 'the channel threshold to delete from')

async function prune() {
	const channel = argv.channel
	const threshold = new Date(parseInt(argv.threshold, 10)) || defaultThreshold()
	const { approveState } = await retrieveLastApproved(channel).catch(e => console.error(e))
	let removeConditions = [
		// prune heartbeat messages
		{ 'msg.type': 'Heartbeat', channel, received: { $gt: threshold } },
		{ 'msg.type': 'Accounting', channel, received: { $gt: threshold } },
		{
			'msg.type': 'NewState',
			channel,
			received: { $gt: threshold },
			'msg.stateRoot': { $ne: approveState.msg.stateRoot }
		},
		{
			'msg.type': 'ApproveState',
			channel,
			received: { $gt: threshold },
			'msg.stateRoot': { $ne: approveState.msg.stateRoot }
		}
	]

	removeConditions = removeConditions.map(cond => remove(cond))
	const result = Promise.all([...removeConditions])
	result.forEach(element => {
		console.log({ element })
		logger.info()
	})
}

function defaultThreshold() {
	const currentDate = new Date()
	currentDate.setMonth(currentDate.getMonth() - 3)
	return currentDate
}

async function remove(cond) {
	const col = db.getMongo().collection('validatorMessages')
	return col.deleteMany({ ...cond }).then(function(err, res) {
		return res
	})
}

async function retrieveLastApproved(channel) {
	const VALIDATOR_MSGS_PROJ = { _id: 0, channelId: 0 }
	const validatorMsgCol = db.getMongo().collection('validatorMessages')
	const approveStateMsgs = await validatorMsgCol
		.find(
			{
				channelId: channel.id,
				from: channel.spec.validators[1].id,
				'msg.type': 'ApproveState'
			},
			{
				projection: VALIDATOR_MSGS_PROJ
			}
		)
		.sort({ received: -1 })
		.limit(1)
		.toArray()
	if (!approveStateMsgs.length) {
		return null
	}
	const approveState = approveStateMsgs[0]
	const newState = await validatorMsgCol.findOne(
		{
			channelId: channel.id,
			from: channel.spec.validators[0].id,
			'msg.type': 'NewState',
			'msg.stateRoot': approveState.msg.stateRoot
		},
		{
			projection: VALIDATOR_MSGS_PROJ
		}
	)
	if (newState) {
		return { newState, approveState }
	}
	return null
}

prune().then(function() {
	logger.info('Finished pruning')
})
