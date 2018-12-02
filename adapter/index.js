// @TODO: proper adapter options
const adapters = {
	dummy: require('./dummy'),
	ethereum: require('./ethereum'),
}

const adapter = process.env.ADAPTER || 'ethereum'
if (!adapters[adapter]) {
	console.error(`Invalid adapter: ${adapter}`)
	process.exit(1)
}

module.exports = adapters[adapter]
