const express = require('express')
const db = require('../db')

const router = express.Router()

router.get('/', function(req, res, next) {
	const eventsCol = db.getMongo().collection('eventAggregates')
	const pipeline = [
		{ $match: { created: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } },
		{
			$project: {
				created: 1,
				value: {
					$sum: {
						$map: {
							input: { $objectToArray: `$events.IMPRESSION.eventPayouts` },
							as: 'item',
							in: { $toLong: '$$item.v' }
						}
					}
				}
			}
		},
		{
			$group: {
				_id: {
					$toDate: {
						$subtract: [
							{ $toLong: '$created' },
							{ $mod: [{ $toLong: '$created' }, 1000 * 60 * 15] }
						]
					}
				},
				value: { $sum: '$value' }
			}
		},
		{ $sort: { _id: 1 } },
		{ $project: { value: '$value', time: '$_id', _id: 0 } }
	]

	return eventsCol
		.aggregate(pipeline)
		.toArray()
		.then(aggr => res.send({ aggr }))
		.catch(next)
})

module.exports = router
