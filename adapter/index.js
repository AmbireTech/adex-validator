const yargs = require('yargs')

const argv = yargs
	.describe('adapter', 'dummy|ethereum')
	.default('adapter', 'ethereum')
	.argv

const adapters = {
	dummy: require('./dummy'),
	ethereum: require('./ethereum'),
}

const adapterName = argv.adapter
if (!adapters[adapterName]) {
	console.error(`Invalid adapter: ${adapterName}`)
	process.exit(1)
}

module.exports = adapters[adapterName]
