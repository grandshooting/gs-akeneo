const mongoose = require('mongoose')
const config = require('./config')
const db = mongoose.connection
const akeneoGsSchema = new mongoose.Schema({account_id:Number}, { strict: false })
const akeneoGsDB = mongoose.model('akeneo_gs', akeneoGsSchema)

mongoose.connect('mongodb://' + config.mongo.host + config.mongo.db, { useNewUrlParser: true, useFindAndModify: false  })
db.on('error', function () {
	console.error('Connection Mongo KO')
	process.exit(1)
})
db.once('open', function () {
	console.log('Connection Mongo OK')
})

module.exports = {
	akeneoGsDB
}