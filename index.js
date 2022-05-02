const akeneo = require("./akeneo")
const gs = require("./gs_actions")
const {akeneoGsDB} = require("./mongo")
const _ = require("lodash")
const Promise = require("bluebird")

var getValue = function(d, akeneoMapping) {
	var value
	if(akeneoMapping.default_lang) {
		value = _(d).filter(v => v.locale == akeneoMapping.default_lang).map("data").value()[0]
	}
	if(! value) {
		value = _(d).map("data").filter().value()[0]
	}
	//console.log("getValue", d, value)
	return value

}

var mapProductToGS = async function(product, akeneoMapping, attributeOptions, loadReferenceEntityValue) {
	var mapping = akeneoMapping.catalog || {}
	var line = {
	}

	//console.log("product", JSON.stringify(product))
	for(var k in mapping) {
		if(mapping[k].root) {
			if(mapping[k].mult) {
				line[mapping[k].col] = [product[k]]
			} else {
				line[mapping[k].col] = product[k]
			}
		}
	}


	if(product.values) {
		for(var k in mapping) {
			if(typeof mapping[k] == "object") {
				if(mapping[k].reference_entity) {
					var value_id = _(product.values[k]).map("data").filter().value()[0]
					var value = await loadReferenceEntityValue(mapping[k].reference_entity, value_id)
					if(value) {
						line[mapping[k].col] = getValue(value.values.label, akeneoMapping)						
					}
				} else if( !mapping[k].root) {
					var value = _(product.values[k]).map("data").filter().value()
					if(! mapping[k].mult) {
						value = value[0]
						if(attributeOptions[k] && attributeOptions[k][value]) {
							value = attributeOptions[k][value]
						}
						line[mapping[k].col] = value
					} else {
						value = _.flatten(_.map(value, v => v.split(",")))
						line[mapping[k].col] = (line[mapping[k].col] || []).concat(value)
					}
				}
			} else {
				line[mapping[k]] = getValue(product.values[k], akeneoMapping)
			}
		}
	}
	//Manage extra info
	for(var key in line) {
		var isExtra = false
		for(var k in mapping) {
			isExtra = isExtra || (mapping[k].col == key && mapping[k].extra)
		}

		if(isExtra) {
			var val = line[key]
			line.extra = line.extra || {}
			line.extra[key] = val
			delete line[key]
		} else if(key != "eans" && _.isArray(line[key])) {
			line[key] = line[key].join(", ")
		}
	}
	//console.log("line", line)
	return line
}

const loadAttributeOptions = async function(akeneo_info, access_token, mapping) {
	var attributes = {}
	for(var k in mapping.catalog) {
		if(mapping.catalog[k].isAttribute) {
			try{
				var options = await akeneo.listAttributeOptions(akeneo_info, access_token, k)
				//console.log("options", options)
				attributes[k] = {}
				for(var option of options) {
					attributes[k][option.code] = option.labels[mapping.default_lang]
				}
			} catch(e) {
				console.log("no options", k)
			}
		}
	}
	return attributes
}

var pushed = {}

const pushProduct = function(account_id, product) {
	pushed[account_id] = pushed[account_id] || []
	pushed[account_id].push(product)
}

var pushedPicture = {}

const pushPicture = function(account_id, picture_id) {
	pushedPicture[account_id] = pushedPicture[account_id] || []
	pushedPicture[account_id].push(picture_id)
}

const iterPushed = async function() {
	try {
	for(var account_id in pushed){
		var products = pushed[account_id]
		delete pushed[account_id]
		if(products && products.length > 0) {
			console.log("send", products.length, account_id)
			await synchroCatalog(account_id, products)
		}
	}
	for(var account_id in pushedPicture){
		var picture_ids = pushedPicture[account_id]
		delete pushedPicture[account_id]
		if(picture_ids && picture_ids.length > 0) {
			picture_ids = _.uniq(picture_ids)
			console.log("publish pictures", picture_ids.length, account_id)
			await broadcastToAssetResource(account_id, picture_ids)
		}
	}
	} catch(e) {
		console.log("error in iterpush", e)
	}
	await Promise.delay(1* 60 * 1000)
	iterPushed()
}

iterPushed()

const synchroCatalog = async function(account_id, productsToSave) {
	const configs = await akeneoGsDB.find({
		account_id: account_id
	}).exec()
	if (_.isEmpty(configs)) {
		console.log("Can't find config for account " + account_id)
	}
	Promise.mapSeries(configs, async config => {
		config = config._doc
		console.log("config", Object.keys(config), config)
		var last_catalog_import_date = new Date()
		config.akeneo_token = await akeneo.renewToken(config.akeneo_info, config.akeneo_token)
		await akeneoGsDB.findOneAndUpdate({ account_id }, {akeneo_token:config.akeneo_token}, { new: false }).exec()
		
		var attributeOptions = await loadAttributeOptions(config.akeneo_info, config.akeneo_token.access_token, config.mapping)
		console.log("attributeOptions", attributeOptions)

		var products = productsToSave 
		if(! products) {
			products = await akeneo.listProducts(config.akeneo_info, config.akeneo_token.access_token, config.last_catalog_import_date)
		}
		var referenceEntitiesCache = {}
		var gsProductsAll = await Promise.mapSeries(products, async product => mapProductToGS(product, config.mapping, attributeOptions, async (type, value_id) => {
			if(! value_id) {
				return value_id
			}
			if(referenceEntitiesCache[value_id]) {
				return referenceEntitiesCache[value_id]
			} else {
				try  {
					if(type == "category") {
						var value = await akeneo.getCategory(config.akeneo_info, config.akeneo_token.access_token, value_id)						
					} else {
						var value = await akeneo.getReferenceEntityValue(config.akeneo_info, config.akeneo_token.access_token, type, value_id)
					}
					referenceEntitiesCache[value_id] = value						
				} catch(e) {
					console.log("no value", value_id, type, e.message)
					return value_id
				}
				return value
			}
		}))
		var grouped = _.groupBy(gsProductsAll, "ref")
		var gsProducts = []
		
		for(var ref in grouped) {
			var group = grouped[ref]
			var line = group[0]
			line.eans = _.filter(_.map(group, "ean")).concat(_.flatten(_.map(group, r => r.eans || [])))
			line.eans = _.uniq(line.eans)
			delete line.ean
			//Gestion extra
			var newExtra = {}
			var hasExtra = false
			for(var g of group) {
				for(var k in (g.extra || {}) ) {
					hasExtra = true
					if(_.isArray(g.extra[k])) {
						newExtra[k] = (newExtra[k] || []).concat(g.extra[k])
					} else {
						newExtra[k] = g.extra[k]
					}
				}
			}
			if(hasExtra) {
				line.extra = newExtra
			}

			gsProducts.push(line)
		}

		//console.log("send product", gsProducts)
		gsProducts = _.filter(gsProducts, p => p.ref)
		console.log("send product", gsProducts)
		await gs.importCatalog(config, gsProducts)
		await akeneoGsDB.findOneAndUpdate({ account_id }, {last_catalog_import_date}, { new: false }).exec()
	})
}


const auth = async function(account_id, {host, login, password, client_id, secret, gs_api_key}) {
	var akeneo_info = {
		host, login, password, client_id, secret
	}

	var akeneo_token = await akeneo.auth(akeneo_info)

	delete akeneo_info.login
	delete akeneo_info.password

	var object = {
			akeneo_info,
			akeneo_token
		}
	if(gs_api_key) {
		object.gs_api_key = gs_api_key
	}

	var savedObject = await akeneoGsDB.findOneAndUpdate({ account_id }, object, { new: true }).exec()
	if (!savedObject) {
		savedObject = await akeneoGsDB.create({...object, account_id:account_id })
	}
	return savedObject
}

const storeMapping = async function(account_id, mapping) {
	return akeneoGsDB.findOneAndUpdate({ account_id }, {mapping}, { new: true }).exec()
}

const loadMapping = async function(account_id) {
	const configs = await akeneoGsDB.find({
		account_id: account_id
	}).exec()
	if (_.isEmpty(configs)) {
		console.log("Can't find config for account " + account_id)
	}
	return configs[0].mapping
}

const broadcast = async function(account_id) {
	const configs = await akeneoGsDB.find({
		account_id: account_id
	}).exec()
	if (_.isEmpty(configs)) {
		console.log("Can't find config for account " + account_id)
	}
	return Promise.mapSeries(configs, async config => {
		config = config._doc
		var pics = await gs.listPicturesToBroadcast(config)
		config.akeneo_token = await akeneo.renewToken(config.akeneo_info, config.akeneo_token)
		await akeneoGsDB.findOneAndUpdate({ account_id }, {akeneo_token:config.akeneo_token}, { new: false }).exec()
		await Promise.mapSeries(pics, async p => {
			var reference = await gs.loadReference(config, p.reference_id)
			if(reference && config.mapping.images && config.mapping.images[p.view_type_code]) {
				console.log("broadcast", p.smalltext, reference.ref)
				var blob = await gs.getPictureAsBlob(config, p)
				await akeneo.uploadMedia(config.akeneo_info, config.akeneo_token.access_token, reference.ref, config.mapping.images[p.view_type_code], blob, p.smalltext)
				await gs.changePicturestatus(config, p, 55)
			} else {
				console.log("can't broadcast", p, reference)
			}
		})
	})
}

const getAssetFamily = (p, tagsObj) => {
	var tags = (tagsObj && tagsObj.tags) || {}
	if(tags["MODEL"] && tags["AMBIANCE"]) {
		return "model_ambiance"
	}
	if(tags["MODEL"]) {
		return "model_studio"
	}
	if(tags["AMBIANCE"]) {
		return "ambiance"
	}
	if(tags["PACKSHOT"]) {
		return "packshot"
	}
	return  "miscellaneous"
}

const broadcastToAssetResource = async function(account_id, picture_ids) {
	const configs = await akeneoGsDB.find({
		account_id: account_id
	}).exec()
	if (_.isEmpty(configs)) {
		console.log("Can't find config for account " + account_id)
	}
	return Promise.mapSeries(configs, async config => {
		config = config._doc
		if(picture_ids) {
			config.mapping.picture_ids = picture_ids
		}
		var pics = await gs.listPicturesToBroadcast(config)
		config.akeneo_token = await akeneo.renewToken(config.akeneo_info, config.akeneo_token)
		await akeneoGsDB.findOneAndUpdate({ account_id }, {akeneo_token:config.akeneo_token}, { new: false }).exec()
		await Promise.mapSeries(pics, async p => {
			var reference = await gs.loadReference(config, p.reference_id)
			if(reference) {
				try {
					var tags = await gs.getPictureTags(config, p)
					console.log("broadcast", p.smalltext, reference.ref)
					var blob = await gs.getPictureAsBlob(config, p)
					await akeneo.uploadAssetMedia(config.akeneo_info, config.akeneo_token.access_token, getAssetFamily(p, tags), blob, p.smalltext, p, {label:p.smalltext, ref_co : reference.ref})
					await gs.changePicturestatus(config, p, p.picturestatus, "Published on akeneo")
				} catch(e) {
					console.log("error uploading image")
					await gs.changePicturestatus(config, p, p.picturestatus, "Error publishing on akeneo")
				}
			} else {
				console.log("can't broadcast", p, reference)
			}
		})
	})
}

module.exports = {
	auth,
	storeMapping,
	loadMapping,
	synchroCatalog,
	pushProduct,
	pushPicture,
	broadcast,
	broadcastToAssetResource
}
