function channelExhausted(channel) {
	return (
		channel.exhausted && channel.exhausted.length === 2 && channel.exhausted.every(n => n === true)
	)
}

module.exports = { channelExhausted }
