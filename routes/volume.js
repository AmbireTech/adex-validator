const express = require('express')
const db = require('../db')

const router = express.Router()

function volumeRoute(monthlyImpressions, req, res, next) {
	const eventsCol = db.getMongo().collection('eventAggregates')
	const DAY = 24 * 60 * 60 * 1000
	const period = monthlyImpressions ? 30 * DAY : DAY
	const interval = monthlyImpressions ? DAY : 15 * 60 * 1000
	const metric = monthlyImpressions ? 'eventCounts' : 'eventPayouts'
	const pipeline = [
		{ $match: { created: { $gt: new Date(Date.now() - period) } } },
		{
			$project: {
				created: 1,
				value: {
					$sum: {
						$map: {
							input: { $objectToArray: `$events.IMPRESSION.${metric}` },
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
						$subtract: [{ $toLong: '$created' }, { $mod: [{ $toLong: '$created' }, interval] }]
					}
				},
				value: { $sum: '$value' }
			}
		},
		{ $sort: { _id: 1 } },
		{ $project: { value: { $toString: '$value' }, time: '$_id', _id: 0 } }
	]

	return eventsCol
		.aggregate(pipeline)
		.toArray()
		.then(aggr => res.send({ aggr }))
		.catch(next)
}

router.get('/', volumeRoute.bind(null, false))
router.get('/monthly-impressions', volumeRoute.bind(null, true))

module.exports = router
