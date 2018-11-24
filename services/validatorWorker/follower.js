const db = require('../../db')
const adapter = require('../../adapter')

function tick({channel, newStateTree, balances}) {
	// @TODO: there's a flaw if we use this in a more-than-two validator setup
	// we compare only OUR last approved state to the NewState
	// instead, we must compare from the latest state approved by any >=2/3 validators
	// otherwise, the leader may perform an invalid state transition from latest approved to a NewState, and trick us into signing it cause we'd be comparing with our own (presumably old)
	return Promise.all([
		getLatestMsg(channel.id, channel.validators[0], 'NewState'),
		getLatestMsg(channel.Id, adapter.whoami(), 'ApproveState'),
	])
	.then(function([newStateMsg, approveStateMsg]) {
		if (!newStateMsg) {
			// there's nothing that we have to do
			return
		}
		// @TODO: compare if newStateMsg is a valid state transition from approveStateMsg
		console.log(newStateMsg, approveStateMsg)
	})
}

function getLatestMsg(channelId, from, type) {
	const validatorMsgCol = db.getMongo().collection('validatorMessages')
	// @TODO: this assumption of getting the latest is flawed; won't work if it's within the same second: https://docs.mongodb.com/manual/reference/method/ObjectId/
	// it is very important that we get this right, since it will be used to gather data about the channel state too
	return validatorMsgCol.find({
		channelId,
		from: from,
		'msg.type': type,
	})
	.sort({ _id: -1 })
	.limit(1)
	.toArray()
	.then(function([msg]) {
		// @TODO assert validity
		return msg
	})
}

// @TODO get previously approved state

module.exports = { tick }

