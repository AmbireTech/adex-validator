
const assert = require('assert')
const dummyVals = require('./prep-db/mongo')
const defaultPubName = dummyVals.ids.publisher
const fetch = require('node-fetch')

function postEvents(url, channelId, events) {
	return fetch(`${url}/channel/${channelId}/events`, {
		method: 'POST',
		headers: {
			'authorization': `Bearer ${dummyVals.auth.user}`,
			'content-type': 'application/json',
		},
		body: JSON.stringify({ events }),
	})
}

function genImpressions(n, pubName) {
	const events = []
	for (let i=0; i<n; i++) events.push({
		type: 'IMPRESSION',
		publisher: pubName || defaultPubName,
	})
	return events
}

function getDummySig(hash, from) {
	return `Dummy adapter signature for ${hash} by ${from}`
}

function wait(ms) {
	return new Promise((resolve, _) => setTimeout(resolve, ms))
}

function filterInvalidNewStateMSg(messages, properties){
    assert.ok(Array.isArray(messages), 'messages should be array')
    
    messages = messages.filter(
        (msg) => msg.msg.reason == properties.reason && msg.msg.stateRoot == properties.stateRoot
    )

    return messages
}

function incrementKeys(raw){	
	let incBalances = {}	
	Object.keys(raw).forEach((item) => ( incBalances[item] = (new BN(raw[item], 10).add(new BN(1))).toString(10) ))	
	return incBalances	
}

module.exports = {
    postEvents,
    genImpressions,
    getDummySig,
    wait,
	filterInvalidNewStateMSg,
	incrementKeys,
}
