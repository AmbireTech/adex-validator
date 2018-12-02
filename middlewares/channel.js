const db = require('../db')

function channelLoad(req, res, next) {
	const id = req.params.id
	const channelsCol = db.getMongo().collection('channels')
	
	channelsCol.find({ _id: id }, { projection: { _id: 0 } })
	.toArray()
	.then(function(channels) {
		if (!channels.length) {
			res.sendStatus(404)
		} else {
			req.channel = channels[0]
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
