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

	tryGetSession(token)
	.then(function(session) {
		if (!session) {
			res.sendStatus(401)
		} else {
			req.session = session
			next()
		}
	})
	.catch(function(e) {
		console.error(e)
		res.sendStatus(500)
	})
}

function tryGetSession(token) {
	const sessions = db.getMongo().collection('sessions')

	// First, check if we already have the session
	return sessions.findOne({ _id: token })
	.then(function(persistedSession) {
		if (persistedSession) {
			return persistedSession
		}

		return adapter.sessionFromToken(token)
		.then(function(session) {
			if (!session) {
				return null
			} else {
				return sessions.insert(session)
				.then(function() { return session })
			}
		})
	})
}

module.exports = { authRequired }
