const adapter = require('../adapter')
const db = require('../db')

const BEARER_PREFIX = 'Bearer '

// @TODO should this be refactored into a separate async function?
function authRequired(req, res, next) {
	const authorization = req.headers.authorization
	if (!authorization.startsWith(BEARER_PREFIX)) {
		res.sendStatus(401)
		return
	}

	const token = authorization.slice(BEARER_PREFIX.length)

	const sessions = db.getMongo().collection('sessions')
	//const findOneSession = sessions.findOne
	//console.log(sessions)
	// First, check if we already have the session
	// @TODO: do mdb
	// Then, check if this is a valid session
	adapter.sessionFromToken(token)
	.then(function(session) {
		if (!session) {
			res.sendStatus(401)
			return
		}
		// @TODO: save to mdb
		req.session = session
		next()
	})
	.catch(function(e) {
		console.error(e)
		res.sendStatus(500)
	})
}

module.exports = { authRequired }
