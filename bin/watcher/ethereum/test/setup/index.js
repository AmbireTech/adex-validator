const { Wallet, providers } = require('ethers')

const provider = new providers.JsonRpcProvider('http://localhost:8545');
const privateKey = '0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501200';
const wallet = new Wallet(privateKey, provider);

module.exports = { 
    wallet
}