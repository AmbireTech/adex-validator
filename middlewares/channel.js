const adapter = require('../adapter')
const db = require('../db')

function channelLoad(req, res, next) {
	const id = req.params.id
	const channelsCol = db.getMongo().collection('channels')
	
	channelsCol.findOne({ _id: id })
	.then(function(channel) {
		if (!channel) {
			res.sendStatus(404)
		} else {
			req.channel = channel
			next()
		}
	})
	.catch(next)
}

function channelIfExists(req, res, next) {
	const id = req.params.id
	const channelsCol = db.getMongo().collection('channels')
	
	channelsCol.countDocuments({ _id: id }, { limit: 1})
	.then(function(n) {
		if (!n) {
			res.sendStatus(404)
		} else {
			next()
		}
	})
	.catch(next)
}

module.exports = { channelLoad, channelIfExists }
