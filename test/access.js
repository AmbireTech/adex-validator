#!/usr/bin/env node

const tape = require('tape-catch')
const { genEvents } = require('./lib')
const checkAccess = require('../services/sentry/lib/access')
const db = require('../db')

tape('check access: session uid rateLimit', async function(t) {
	const channel = {
		id: `${Date.now()}`,
		creator: 'creator',
		spec: {
			eventSubmission: {
				allow: [{ uids: null, rateLimit: { type: 'uid', timeframe: 20000 } }]
			}
		}
	}

	const events = genEvents(2, 'working')
	const response = await checkAccess(channel, { uid: 'response' }, events)
	t.equal(response.success, true, 'should process request')

	const tooManyRequest = await checkAccess(channel, { uid: 'response' }, events)

	t.equal(tooManyRequest.success, false, 'should not process request')
	t.equal(tooManyRequest.statusCode, 429, 'should have too many requests status code')

	t.end()
})

tape('check access: ip rateLimit', async function(t) {
	const channel = {
		id: `${Date.now()}`,
		creator: 'creator',
		spec: {
			eventSubmission: {
				allow: [{ uids: null, rateLimit: { type: 'ip', timeframe: 20000 } }]
			}
		}
	}

	const events = genEvents(2, 'working')
	const allowOnlyOneEvent = await checkAccess(channel, {}, events)
	t.equal(allowOnlyOneEvent.success, false, 'should not process request')
	t.equal(allowOnlyOneEvent.statusCode, 429, 'should have too many requests status code')
	t.equal(allowOnlyOneEvent.message, 'rateLimit: only allows 1 event', 'invalid error message')

	const response = await checkAccess(channel, {}, [events[0]])

	t.equal(response.success, true, 'should process request')

	t.end()
})

// redis connection preventing test from closing
// hence the quit
tape.onFinish(() => db.getRedis().quit())
