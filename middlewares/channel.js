const db = require('../db')

function channelLoad(req, res, next) {
	const { id } = req.params
	const channelsCol = db.getMongo().collection('channels')

	channelsCol
		.find({ _id: id }, { projection: { _id: 0 } })
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

function channelIfFind(cond, req, res, next) {
	const channelsCol = db.getMongo().collection('channels')
	channelsCol
		.countDocuments(cond, { limit: 1 })
		.then(function(n) {
			if (!n) {
				res.sendStatus(404)
			} else {
				next()
			}
		})
		.catch(next)
}

function channelIfExists(req, res, next) {
	channelIfFind({ _id: req.params.id }, req, res, next)
}

function channelIfActive(req, res, next) {
	channelIfFind({ _id: req.params.id, 'spec.validators.id': req.whoami }, req, res, next)
}

// requires channelLoad
function channelIfGrace(req, res, next) {
	const { channel } = req
	const currentTime = Date.now()
	if (channel.spec.gracePeriod || currentTime > channel.validUntil) {
		// prevent updating state
		res.sendStatus(400)
		return
	}
	next()
}

module.exports = { channelLoad, channelIfExists, channelIfActive, channelIfGrace }
