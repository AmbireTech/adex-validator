const { MongoClient } = require('mongodb')

const url = process.env.DB_MONGO_URL || 'mongodb://localhost:27017'

let mongoClient = null

function connect() {
	return new Promise(function(resolve, reject) {
		MongoClient.connect(url, { useNewUrlParser: true }, function(err, client) {
			if (err) {
				reject(err)
			} else {
				mongoClient = client
				resolve()
			}
		})
	})
}

function getMongo() {
	return mongoClient
}

module.exports = { connect, getMongo }
