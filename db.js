const { MongoClient } = require('mongodb')
const redis = require('redis')

const url = process.env.DB_MONGO_URL || 'mongodb://localhost:27017'
const dbName = process.env.DB_MONGO_NAME || 'adexValidator'
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379'

let mongoClient = null

function connect() {
	return MongoClient.connect(url, { useNewUrlParser: true }).then(function(client) {
		mongoClient = client
	})
}

function getMongo() {
	if (mongoClient) return mongoClient.db(dbName)
	throw new Error('db.connect() needs to be invoked before using getMongo()')
}

function getRedis() {
	return redis.createClient(redisUrl)
}

module.exports = { connect, getMongo, getRedis }
