const { MongoClient } = require('mongodb')

const url = process.env.DB_MONGO_URL || 'mongodb://localhost:27017'
const dbName = process.env.DB_MONGO_NAME || 'adexValidator'

let mongoClient = null

// @TODO: we need a better wrapper, abstraction on all of this
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
	if (mongoClient) return mongoClient.db(dbName)
	else return null
}

module.exports = { connect, getMongo }
