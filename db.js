const { MongoClient } = require('mongodb')
const redis = require('redis')

const url = process.env.DB_MONGO_URL || 'mongodb://localhost:27017'
const dbName = process.env.DB_MONGO_NAME || 'adexValidator'
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379'

const useTls = process.env.DB_MONGO_TLS || false
const tlsCAfile = process.env.DB_MONGO_TLS_CAFILE || 'rootCA.crt'
const tlsCertificate = process.env.DB_MONGO_TLS_CERT || 'adexnetwork.pem'

let mongoClient = null
let redisClient = null

const options = {
	useNewUrlParser: true,
	useUnifiedTopology: true
}

const tlsOptions = {
	useNewUrlParser: true,
	useUnifiedTopology: true,
	tlsCAFile: tlsCAfile,
	tlsCertificateKeyFile: tlsCertificate
}

function connect() {
	return MongoClient.connect(url, useTls ? tlsOptions : options).then(function(client) {
		mongoClient = client
	})
}

function getMongo() {
	if (mongoClient) return mongoClient.db(dbName)
	throw new Error('db.connect() needs to be invoked before using getMongo()')
}

function getRedis() {
	if (!redisClient) {
		redisClient = redis.createClient(redisUrl)
	}
	return redisClient
}

function close() {
	return mongoClient.close()
}

module.exports = { connect, getMongo, close, getRedis }
