var request = require("superagent")
var _ = require("lodash")
var Promise = require("bluebird")

const getAuth = function(config) {
	return new Buffer(config.client_id + ":" + config.secret).toString('base64');
}

const auth = async function(config) {
	console.log("config", config)
	var response = await request.post(config.host + "/api/oauth/v1/token")
		.set({
			Authorization: "Basic " + getAuth(config),
			"Content-Type": "application/json"
		}).send({
            "grant_type": "password",
            "username": config.login,
            "password": config.password,
            client_id : config.client_id,
            secret : config.secret
        }).catch(e => console.error("authentication error", e))

	if(response.body) {
		//console.log(response.body)
		return response.body
	} else {
		console.error("no response to give")
	}
}

const renewToken = async function(config, currentTokenInfo) {
	var response = await request.post(config.host + "/api/oauth/v1/token")
		.set({
			Authorization: "Basic " + getAuth(config),
			"Content-Type": "application/json"
		}).send({
            "grant_type": "refresh_token",
            refresh_token : currentTokenInfo.refresh_token
        }).catch(e => console.error("authentication error", e))

	if(response.body) {
		//console.log(response.body)
		return response.body
	} else {
		console.error("no response to give")
	}
}





var listProducts = async function(config, token, last_import_date) {

	//var productModels = await listAllProductModels(config, token)
	var products = await listAllProducts(config, token, last_import_date)

	//console.log("products", JSON.stringify(products, null, 1))

	return products
}

var listAllProducts = async function(config, token) {
	return iterAll(token, config.host + "/api/rest/v1/products?pagination_type=search_after&limit=100", [], {
			search:JSON.stringify({"updated":[{"operator":"SINCE LAST N DAYS","value":1}]})
		})
}

var listAllProductModels = async function(config, token) {
	return iterAll(token, config.host + "/api/rest/v1/product-models?pagination_type=search_after&limit=100", [])
}


var iterAll = async function(token, url, result, filter) {
	console.log("iterAll", url)
	var response = await request.get(url)
		.set({
			Authorization: "Bearer " + token,
			"Accept": "application/json"
		})
		.query(filter || {}).catch(e => console.log("error", e))
	//console.log(response.body)
	if(response.body._embedded && response.body._embedded.items) {
		result = result.concat(response.body._embedded.items)

		//console.log("result", JSON.stringify(response.body._embedded.items, null, 1), result.length, response.body._links.next && response.body._links.next.href)
		if(result.length < 1000*1000*10 && response.body._links && response.body._links.next && response.body._links.next.href) {
			await Promise.delay(100)
			return iterAll(token, response.body._links.next.href ,result, filter).catch(e => {
				console.log("error, can't get more", e)
				return result
			})
		} else {
			return result
		}		
	} else {
		return response.body
	}

}



var listFamilies = async function(config, token) {
	return iterAll(token, config.host + "/api/rest/v1/families?limit=100", [])
}
var listCategories = async function(config, token) {
	return iterAll(token, config.host + "/api/rest/v1/categories?limit=100", [])
}
var getCategory = async function(config, token, code) {
	var response = await request.get(config.host + "/api/rest/v1/categories/" + code)
		.set({
			Authorization: "Bearer " + token,
			"Accept": "application/json"
		})
		.catch(e => console.log("error", e))
	
	var value = response.body
	console.log("category", code, value)
	//On le format comme le reste
	var res = {
		values : {
			label : _.map(value.labels, (v, l) => ({
				locale : l,
				data : v
			}))
		}
	}
	return res
}
var listAttributeOptions = async function(config, token, code) {
	return iterAll(token, config.host + "/api/rest/v1/attributes/" + encodeURIComponent(code) + "/options?limit=100", [])
}
var listAttribute = async function(config, token) {
        return iterAll(token, config.host + "/api/rest/v1/attributes?limit=100", [])
}

var listReferenceEntities = async function(config, token) {
        return iterAll(token, config.host + "/api/rest/v1/reference-entities?limit=100", [])
}
var getReferenceEntityValue = async function(config, token, referenceEntity, value) {
        return iterAll(token, config.host + "/api/rest/v1/reference-entities/"+ referenceEntity + "/records/" + value + "?limit=100", [])
}

var uploadMedia = async function(config, token, product_model_id, column, file, filename) {
	console.log("upload", product_model_id, column, filename)
	var response = await request.post(config.host + "/api/rest/v1/media-files")
		.set({
			Authorization: "Bearer " + token,
			"Accept": "application/json"
		})
		.field("product_model", JSON.stringify({"code":product_model_id, "attribute":column, "scope":null,"locale":null}))
		.attach("file", file, filename)
		.catch(e => console.log("upload error", e))
	console.log("upload response", response && response.body, response && response.statusCode)
	return response
}

const mapAttributes = att => {
	var res = {}
	for(var a in att) {
		res[a] = [{
			locale:a == "label" ? "fr_FR" : null,
			channel : null,
			data : att[a]
		}]
	}
	return res
}


var createAssetObject = async function(config, token, asset_family_code, assetMediaFileCode, picture, attributes) {
	var response = await request.patch(config.host + "/api/rest/v1/asset-families/" + asset_family_code + "/assets/" + "gs" + picture.picture_id)
		.set({
			Authorization: "Bearer " + token,
			"Accept": "application/json"
		})
		.send({
			code : "gs" + picture.picture_id,
			values : mapAttributes(_.defaults({
				media : assetMediaFileCode
			}, attributes))
		})
	console.log("upload response", response && response.body, response && response.statusCode, response && response.header)

}

var dropAsset = async function(config, token, asset_family_code, picture) {
	var response = await request.delete(config.host + "/api/rest/v1/asset-families/" + asset_family_code + "/assets/" + "gs" + picture.picture_id)
		.set({
			Authorization: "Bearer " + token,
			"Accept": "application/json"
		})
	console.log("upload response", response && response.body, response && response.statusCode, response && response.header)
}


const uploadAssetMedia = async function(config, token, asset_family_code, file, filename, picture, attributes) {
	console.log("upload", filename)
	var response = await request.post(config.host + "/api/rest/v1/asset-media-files")
		.set({
			Authorization: "Bearer " + token,
			"Accept": "application/json"
		})
		.attach("file", file, filename)
	console.log("upload response", response && response.body, response && response.statusCode, response && response.header)
	if(response.header['asset-media-file-code']) {
		var assetMediaFileCode = response.header['asset-media-file-code']
	} else {
		throw new Error("invalid response on upload")
	}

	//create asset object
	try {
		await createAssetObject(config, token, asset_family_code, assetMediaFileCode, picture, attributes)		
	} catch(e) {
		//An asset can't be in 2 different asset family, we clean and retry
		console.log("error first upload, we clean if it was previously in another family and retry")
		for(var family of config.mapping.asset_families) {
			try{
				await dropAsset(config, token, family, picture)
			} catch(e) {
			}
		}
		await createAssetObject(config, token, asset_family_code, assetMediaFileCode, picture, attributes)		
	}
}


const loadExemple = function(config, code) {

}

module.exports = {
	listAttributeOptions,
	listAttribute,
	loadExemple,
	auth,
	renewToken,
	listProducts,
	uploadMedia,
	uploadAssetMedia,
	listReferenceEntities,
	getReferenceEntityValue,
	getCategory,
}
