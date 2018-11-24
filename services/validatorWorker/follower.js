const BN = require('bn.js')
const db = require('../../db')
const adapter = require('../../adapter')

function tick({channel, newStateTree, balances}) {
	// @TODO: there's a flaw if we use this in a more-than-two validator setup
	// SEE https://github.com/AdExNetwork/adex-validator-stack-js/issues/4
	return Promise.all([
		getLatestMsg(channel.id, channel.validators[0], 'NewState'),
		getLatestMsg(channel.Id, adapter.whoami(), 'ApproveState'),
	])
	.then(function([newMsg, approveMsg]) {
		if (!newMsg) {
			// there's nothing that we have to do
			return
		}
		const prevBalancesRaw = approveMsg ? approveMsg.msg.balances : {}
		const prevBalances = toBalanceTree(prevBalancesRaw)
		const newBalancesRaw = newMsg.msg.balances
		const newBalances = toBalanceTree(newBalancesRaw)
		if (!isValidTransition(channel, prevBalances, newBalances)) {
			console.error(`validatatorWorker: ${channel.id}: invalid transition requested in NewState`, prevBalances, newBalances)
			return
		}

		const stateRoot = newMsg.msg.stateRoot
		const sig = adapter.sign(stateRoot)
		console.log({
			type: 'ApproveState',
			stateRoot: stateRoot.toString('hex'),
			sig,
		})
	})
}

// Implements constraints described at: https://github.com/AdExNetwork/adex-protocol/blob/master/OUTPACE.md#specification
function isValidTransition(channel, prevTree, newTree) {
	const sumPrev = sumTree(prevTree)
	const sumNew = sumTree(newTree)
	return sumNew >= sumPrev
		&& sumNew <= channel.depositAmount
		&& Object.entries(newTree).every(([acc, bal]) => {
			const prevBal = prevTree[acc]
			if (!prevBal) return true
			return bal.gte(prevBal)
		})
}

function sumTree(tree) {
	return Object.values(tree).reduce((a,b) => a.add(b), new BN(0))
}

function toBalanceTree(raw) {
	const balances = {}
	Object.entries(raw).forEach(([acc, bal]) => balances[acc] = new BN(bal, 10))
	return balances
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

module.exports = { tick }

