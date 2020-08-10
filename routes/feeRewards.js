const db = require('../db')

module.exports = async (_, res) =>
	res.send(
		await db
			.getMongo()
			.collection('rewardChannels')
			.find({ validUntil: { $gt: Math.floor(Date.now() / 1000) } })
			.sort({ periodStart: -1 })
			.limit(40)
			.toArray()
	)
