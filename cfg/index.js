module.exports = process.NODE_ENV === 'production' ? require('./prod') : require('./dev')
