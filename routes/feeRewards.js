const db = require('../db')

module.exports = async (_, res) =>
	res.send(
		await db
			.getMongo()
			.collection('rewardChannels')
			.find()
			.sort({ periodStart: -1 })
			.limit(12)
			.toArray()
	)
