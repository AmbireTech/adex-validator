const fetch = require('node-fetch')
const assert = require('assert')
const cfg = require('../../../cfg')

const LOG_PREFIX = 'sentryInterface'

// Using ES5-style initiation rather than ES6 classes
// cause we want private properties
function SentryInterface(adapter, channel, opts = { logging: true }) {
	// Private
	const receivers = channel.spec.validators
	const whoami = adapter.whoami()
	const ourValidator = channel.spec.validators.find(v => v.id === whoami)
	assert.ok(ourValidator, 'we can not find validator entry for whoami')
	const baseUrl = `${ourValidator.url}/channel/${channel.id}`

	async function propagateTo(receiver, messages) {
		const authToken = await adapter.getAuthFor(receiver)
		const fetcher = fetchJson(`${receiver.url}/channel/${channel.id}/validator-messages`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${authToken}`
			},
			body: JSON.stringify({ messages })
		})
		if (receiver.url === ourValidator.url) {
			// We don't apply the timeout if we're sending to our own Sentry
			return fetcher
		}
		return Promise.race([fetcher, getTimeout(receiver)])
	}

	// Public
	this.propagate = function(msgs) {
		if (opts.logging) logPropagate(adapter, receivers, channel, msgs)
		return Promise.all(
			receivers.map(recv =>
				propagateTo(recv, msgs).catch(onPropagationError.bind(null, adapter, recv, msgs))
			)
		)
	}

	this.getLatestMsg = function(from, type) {
		const url = `${baseUrl}/validator-messages/${from}/${type}?limit=1`
		return fetchJson(url).then(({ validatorMessages }) =>
			validatorMessages.length ? validatorMessages[0].msg : null
		)
	}

	this.getOurLatestMsg = function(type) {
		return this.getLatestMsg(adapter.whoami(), type)
	}

	this.getLastApproved = function() {
		const lastApprovedUrl = `${baseUrl}/last-approved`
		return fetchJson(lastApprovedUrl).then(({ lastApproved }) => lastApproved)
	}

	this.getEventAggrs = async function(params = { after: 0 }) {
		const authToken = await adapter.getAuthFor(ourValidator)
		let url = `${baseUrl}/events-aggregates`
		if (params.after) url = `${url}?after=${new Date(params.after).getTime()}`
		return fetchJson(url, {
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${authToken}`
			}
		}).then(({ events }) => events)
	}

	return Object.freeze(this)
}

async function fetchJson(url, opts) {
	const resp = await fetch(url, opts)
	if (resp.status !== 200) {
		return Promise.reject(new Error(`request failed with status code ${resp.status}`))
	}
	return resp.json()
}

function onPropagationError(adapter, recv, msgs, e) {
	// propagating to our own validator is not recoverable
	if (recv.id === adapter.whoami()) throw e
	// eslint-disable-next-line no-console
	console.error(
		`${LOG_PREFIX}: Unable to propagate ${summarizeMsgs(msgs)} to ${recv.id}: ${e.message || e}`
	)
}

function logPropagate(adapter, recvs, channel, msgs) {
	// @TODO detailed log for some types of messages, e.g. RejectState
	// eslint-disable-next-line no-console
	console.log(
		`${LOG_PREFIX}(${adapter.whoami()}): channel ${channel.id}: propagating ${summarizeMsgs(
			msgs
		)} to ${recvs.length} validators`
	)
}

function getTimeout(recv) {
	return new Promise((resolve, reject) =>
		setTimeout(
			() => reject(new Error(`propagation to ${recv.id} timed out`)),
			cfg.PROPAGATION_TIMEOUT
		)
	)
}

function summarizeMsgs(messages) {
	return messages.map(x => x.type).join(', ')
}

module.exports = SentryInterface
