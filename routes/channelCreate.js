const express = require('express')
const { celebrate } = require('celebrate')
const cfg = require('../cfg')
const schema = require('./channelSchema')
const db = require('../db')

function forAdapter(/* adapter */) {
	const router = express.Router()
	router.post('/', celebrate({ body: schema.createChannel(cfg) }), function(req, res, next) {
		const channelsCol = db.getMongo().collection('channels')
		const channel = {
			...req.body,
			_id: req.body.id
		}

		channelsCol
			.insertOne(channel)
			.then(() => res.send({ success: true }))
			.catch(err => {
				if (err.code === 11000) {
					res.status(409).send({ message: 'channel already exists' })
					return
				}
				throw err
			})
			.catch(next)
	})
	return router
}
module.exports = { forAdapter }
