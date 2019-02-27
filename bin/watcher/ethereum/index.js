// const Web3 = require('web3')
// const provider = new Web3.providers.HttpProvider("http://localhost:8545")
// const web3 = new Web3 (provider)

const { providers, Contract, Wallet } = require('ethers')
const cfg = require('./cfg')
// const web3Provider = new providers.Web3Provider(web3.currentProvider)
const provider = providers.getDefaultProvider('mainnet');
const abi = require("adex-protocol-eth/abi/AdExCore.abi");

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

function eventListener(channelId, eventObj){
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
    )
}

function campaignTick(data) {
    const { watcher: { ethereum: { contract }}} = data
    if(listeningContracts.includes(contract)){
        return;
    }

    listeningContracts.push(contract)
    let contract = new Contract(contract, abi, provider);
    const eventName = 'LogChannelOpen'
    
    contract.on(eventName, eventListener)
}

function wait(ms) {
	return new Promise((resolve, _) => setTimeout(resolve, ms))
}
