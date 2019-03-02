#!/usr/bin/env node

const { providers, Contract } = require('ethers')
const cfg = require('./cfg')

const provider = new providers.JsonRpcProvider(cfg.HTTP_PROVIDER);
const abi = require('adex-protocol-eth/abi/AdExCore.json')

const db = require('../../../db')

const listeningContracts = new Array()
let lastestTime = 0

db.connect()
.then(function(){
    function allPendingCampaignsTick(){
        // subsribe to the ethereum network for events
    
        const channelsCol = db.getMongo().collection('channels')
        //
        const key = `watcher.ethereum.contract`
    
        return channelsCol.find({
            status: 'pending',
            [key]: { $exists: true },
            created: { $gt: lastestTime }
        })
        .toArray()
        .then(function(data) {
            console.log(`watcher: processing ${data.length} campaigns`)

            return Promise.all([
				Promise.all(data.map(campaignTick)),
				wait(cfg.SNOOZE_TIME)
			])
        })
    }

    function loop(){
        allPendingCampaignsTick()
		.then(function() { loop() })
    }

    loop()
})
.catch(function(err) {
	console.error('Fatal error while connecting to the database', err)
	process.exit(1)
})

function updateStatus(channelId, eventObj){    
    channelId = channelId.toString()

    // move the status of the channel to active
    const channelsCol = db.getMongo().collection('channels')

    return channelsCol
    .updateOne(
        { _id: channelId },
        { $set: 
            {
            status: 'active'
            } 
        },
        { upsert: false }
    ).then(() => console.log(`Status of campaign ${channelId} updated to active`))
    
}

function campaignTick(data) {
    const { watcher: { ethereum: { contract }}} = data
    if(listeningContracts.includes(contract)){
        return;
    }

    listeningContracts.push(contract)
    let adexCore = new Contract(contract, abi, provider);
    const eventName = 'LogChannelOpen'
    
    adexCore.on(eventName, updateStatus)
    lastestTime = Date.now()
}

function wait(ms) {
	return new Promise((resolve, _) => setTimeout(resolve, ms))
}
