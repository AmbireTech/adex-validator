const adapter = require('../adapter')

const BEARER_PREFIX = 'Bearer '

// @TODO should this be refactored into a separate async function?
function authRequired(req, res, next) {
	const authorization = req.headers.authorization
	if (!authorization.startsWith(BEARER_PREFIX)) {
		res.send(401)
		return
	}

	const token = authorization.slice(BEARER_PREFIX.length)

	// First, check if we already have the session

	// Then, check if this is a valid session
	adapter.sessionFromToken(token)
	.then(function(session) {
		if (!session) {
			res.send(401)
			return
		}
		req.session = session
		next()
	})
	.catch(function(e) {
		console.error(e)
		res.send(500)
	})
}

module.exports = { authRequired }
