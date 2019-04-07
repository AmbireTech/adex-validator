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
function channelIfWithdraw(req, res, next) {
	const { channel } = req
	const { spec, validUntil } = channel
	const currentTime = Date.now()
	const isAllowedToSubmit = !spec.withdrawPeriodStart || currentTime < spec.withdrawPeriodStart
	const withinTime = validUntil > currentTime / 1000

	if (!isAllowedToSubmit || !withinTime) {
		const message = 'channel cannnot update state, channel'
		// prevent updating state
		res.status(400).send({
			message: `${message} ${!isAllowedToSubmit ? 'in grace period' : 'has expired'}`
		})
		return
	}
	next()
}

module.exports = { channelLoad, channelIfExists, channelIfActive, channelIfWithdraw }
