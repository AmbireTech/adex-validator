const express = require('express')
const { celebrate } = require('celebrate')
const schema = require('./schemas')
const db = require('../db')

function forAdapter(adapter) {
	const router = express.Router()
	router.post('/', celebrate({ body: schema.createChannel }), function(req, res, next) {
		const channelsCol = db.getMongo().collection('channels')
		const channel = {
			...req.body,
			_id: req.body.id
		}

		adapter
			.validateChannel(channel)
			.then(success => {
				if (!success) throw new Error('adapter validation not successful')
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
			.catch(err => {
				res.status(400).send({ message: err.message })
			})
	})
	return router
}

module.exports = { forAdapter }
