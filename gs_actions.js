var request = require("superagent")
var _ = require("lodash")
var Promise = require("bluebird")


const getApiUrl = function(config) {
	return config.gs_api_url || "https://api.grand-shooting.com/v3"
}


const importCatalog = async function(config, products) {
	return Promise.mapSeries(_.chunk(products, 100), _products => {
		console.log('send import catalog chunk ', _products.length)
		return request.post(getApiUrl(config) + "/reference/bulk")
			.set("Authorization", "Bearer " + config.gs_token)
			.type("json")
			.send(_products).catch(e => console.log("error processing chunk", e))
	}).then(res => _.flatten(res))

}

const loadReference = async function(config, reference_id) {
		var res = await request.get(getApiUrl(config) + "/reference/" + reference_id)
			.set("Authorization", "Bearer " + config.gs_token)
			.type("json")
		return res.body
}

const getPictureTags = async function(config, picture) {
		var res = await request.get(getApiUrl(config) + "/picture/" + picture.picture_id + "/tag")
			.set("Authorization", "Bearer " + config.gs_token)
			.type("json")
		return res.body
}

const getPictureAsBlob = async function(config, picture) {
	var res = await request.get(getApiUrl(config) + "/picture/" + picture.picture_id + "/download")
									.set('Authorization', "Bearer " + config.gs_token)
									.responseType('blob')
	return res.body
}

const listPicturesToBroadcast = async function(config, from = 0, pics=[]) {
	const queryParams = {
			picturestatus : config.mapping.picture_ids ? [50, 51, 52, 55] : config.mapping.broadcast_status || [50, 52], //51
			benchsteptype:40,
			export : config.mapping.broadcast_exports || undefined,
			reference_id : config.mapping.reference_id || "gte:1",
			bench_id : config.mapping.bench_id || undefined,
			shootingmethod: config.mapping.shootingmethod || undefined,
			picture_id : config.mapping.picture_ids || undefined,
	}
	console.log("list pictures", from, queryParams)
	return request.get(getApiUrl(config) + "/picture")
		.query (queryParams)
		.set("offset", from)
		.set("Authorization", "Bearer " + config.gs_token)
		.type("json")
		.then(res => {
			var resPics = res.body
			console.log("resPics", from, resPics.length, resPics[0])
			if(resPics.length == 0) {
				return pics
			} else {
				pics = pics.concat(resPics)
				return Promise.delay(250).then(() => listPicturesToBroadcast(config, from + resPics.length, pics))
			}
		})
}

var changePicturestatus = async function(config, picture, picturestatus, comment ) {
	return request.post(getApiUrl(config) + "/picture/" + picture.picture_id + "/picturestatus")
				.set("Authorization", "Bearer " + config.gs_token)
				.type("json")
				.send({picturestatus:picturestatus, comment : comment || undefined})
				.then(res => {
					return Promise.delay(500)
				}).catch(e => console.error("error", e))
}


module.exports = {
	importCatalog,
	listPicturesToBroadcast,
	changePicturestatus,
	loadReference,
	getPictureTags,
	getPictureAsBlob
}
