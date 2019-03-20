const db = require('../db')

function channelLoad(req, res, next) {
	const { id } = req.params
	const channelsCol = db.getMongo().collection('channels')

	channelsCol
		.find({ _id: id, status: 'active' }, { projection: { _id: 0 } })
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
	channelIfFind({ _id: req.params.id, status: 'active' }, req, res, next)
}

function channelIfActive(req, res, next) {
	channelIfFind({ _id: req.params.id, validators: req.whoami, status: 'active' }, req, res, next)
}

module.exports = { channelLoad, channelIfExists, channelIfActive }
