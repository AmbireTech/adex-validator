const cluster = require('cluster')
const os = require('os')
const logger = require('../services/logger')('cluster')

const setupWorkerProcesses = () => {
	// to read number of cores on system
	const maxWorkers = process.env.MAX_WORKERS ? parseInt(process.env.MAX_WORKERS, 10) : 0
	const numCores = os.cpus().length
	const workers = maxWorkers && !Number.isNaN(maxWorkers) ? maxWorkers : numCores
	logger.info(`Master cluster setting up ${workers} workers`)

	// iterate on number of cores need to be utilized by an application
	// current example will utilize all of them
	for (let i = 0; i < workers; i += 1) {
		cluster.fork()
	}

	cluster.on('online', function(worker) {
		logger.info(`Worker ${worker.process.pid} is listening`)
	})

	// if any of the worker process dies then start a new one by simply forking another one
	cluster.on('exit', function(worker, code, signal) {
		logger.error(`Worker ${worker.process.pid} died with code: ${code}, and signal: ${signal}`)
		logger.info('Starting a new worker')
		cluster.fork()
	})
}

const createCluster = fn => {
	if (cluster.isMaster) {
		setupWorkerProcesses()
	} else {
		fn()
	}
}

module.exports = createCluster
