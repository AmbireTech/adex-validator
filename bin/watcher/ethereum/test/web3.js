const { providers, Contract, Wallet } = require('ethers')
const provider = new providers.JsonRpcProvider('http://localhost:8545');

let core = null
const privateKey = '0x0123456789012345678901234567890123456789012345678901234567890123';
let wallet = new Wallet(privateKey, provider);

async function deployContract() {
    if(core){
        return;
    }

    core = new Contract(contract, abi, wallet);
}

async function channelOpen() {
   
    const blockTime = (await web3.eth.getBlock('latest')).timestamp
    const channel = sampleChannel(wallet.address, tokens, blockTime+50, 0)


    function sampleChannel(creator, amount, validUntil, nonce) {
        const spec = new Buffer(32)
        spec.writeUInt32BE(nonce)
        return new Channel({
            creator,
            tokenAddr: token.address,
            tokenAmount: amount,
            validUntil,
            validators: [accounts[0], accounts[1]],
            spec,
        })
    }

    console.log('core address')
    console.log(core.address)
    const blockTime = (await web3.eth.getBlock('latest')).timestamp
    const channel = sampleChannel(accounts[0], tokens, blockTime+50, 0)
    const receipt = await (await core.channelOpen(channel.toSolidityTuple())).wait()
    const ev = receipt.events.find(x => x.event === 'LogChannelOpen') 
    // core = new Contract(coreWeb3.address, AdExCore._json.abi, signer)
}

channelOpen()
.then(function(){

})