const db = require('../../db')

function tick({channel, newStateTree, balances}) {
	// @TODO; get previous approved state
	return getLatestNewStateMsg(channel)
	.then(function(msg) {
		console.log(msg)
	})
}

function getLatestNewStateMsg(channel) {
	const validatorMsgCol = db.getMongo().collection('validatorMessages')
	// @TODO: this assumption of getting the latest is flawed; won't work if it's within the same second: https://docs.mongodb.com/manual/reference/method/ObjectId/
	// it is very important that we get this right, since it will be used to gather data about the channel state too
	return validatorMsgCol.find({
		from: channel.validators[0],
		channelId: channel.id,
		'msg.type': 'NewState',
	})
	.sort({ _id: -1 })
	.limit(1)
	.toArray()
	.then(function([newStateMsg]) {
		// @TODO assert validity
		return newStateMsg
	})
}

// @TODO get previously approved state

module.exports = { tick }

