function channelExhausted(channel) {
	return (
		channel.exhausted && Object.values(channel.exhausted)[0] && Object.values(channel.exhausted)[1]
	)
}

module.exports = { channelExhausted }
