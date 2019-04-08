const winston = require('winston')

const logger = winston.createLogger({
	level: 'info',
	format: winston.format.json(),
	transports: [
		//
		// - Write to all logs with level `info` and below to `combined.log`
		// - Write all logs error (and below) to `error.log`.
		//
		new winston.transports.Console({
			format: winston.format.combine(
				winston.format.colorize({ all: true }),
				winston.format.simple(),
				winston.format.printf(info => `${info.message}`)
			)
		}),
		//new winston.transports.File({ filename: 'error.log', level: 'error' }),
		//new winston.transports.File({ filename: 'combined.log' })
	]
})

module.exports = function(prefix) {
	return {
		error(text) {
			logger.error(`${prefix}: ${text}`)
		},
		info(text) {
			logger.info(`${prefix}: ${text}`)
		}
	}
}
