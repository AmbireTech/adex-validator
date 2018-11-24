function tick({channel, newStateTree, balances}) {
	console.log(`Follower tick for ${channel.id}`)
	return Promise.resolve()
}

module.exports = { tick }

