const Promise = require('bluebird')
const express = require('express')
const bodyParser = require('body-parser')
const config = require('./config')
const {pushProduct, pushPicture} = require("./index")

const PORT = process.env.PORT || config.port || 4459

const app = express()

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json({limit: '100mb'}))


app.post('/gs-akeneo/webhook/:account_id/', async (req, res) => {
	console.log("received hook", req.params.account_id, JSON.stringify(req.body, null, 1))
	for(var body of req.body.events) {
//		var body = req.body
		if(body && body.action && body.action.startsWith("product.")) {
			pushProduct(req.params.account_id, body.data.resource)
		}
	}
	res.send("OK")
})


app.listen(PORT)
console.log('Application GS-Akeneo  started, listen on ' + PORT)
