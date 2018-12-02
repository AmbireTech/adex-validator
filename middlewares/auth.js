const db = require('../db')

const BEARER_PREFIX = 'Bearer '

function forAdapter(adapter) {
	return function authMiddleware(req, res, next) {
		const authorization = req.headers.authorization
		if (!authorization || !authorization.startsWith(BEARER_PREFIX)) {
			next()
			return
		}

		const token = authorization.slice(BEARER_PREFIX.length)

		adapter.sessionFromToken(token)
		.then(function(session) {
			req.session = session
			next()
		})
		.catch(next)
	}
}

module.exports = { forAdapter }
