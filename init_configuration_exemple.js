var config = require("./config")

var api = require("./index")

const {akeneoGsDB} = require("./mongo")

const account_id = -1 //your Grand Shooting account_id that can be obtained from GS Support team

var mapping = {
	catalog : {
		//name : "smalltext",
		identifier : {col:"skus", root:true, mult:true, extra:true},
		ean : {col:"eans", mult:true},
		parent : {col:"ref", root:true},
		brand : {reference_entity:"brand", col:"brand" }, //{col : "brand", isAttribute:true},
		sector : {col:"univers", isAttribute:true},
		main_gender : {col:"gender", isAttribute:true},
		collections: {col:"collection"},
		title : "smalltext",
		ref_model : "product_ref",
		comment_mel : "comment",
//		refcolor_col : "ref",
		color_comments : {col:"color"}
	},
	asset_families : ["Packshot", "Model", "Partners"],
	default_lang : "fr_FR",
	images : {
		"1" : "image"
	},
	broadcast_status : [50, 52] //Validated and Media in error
}


var test = async function() {
	var tokenInfo = await getToken()
	var token = tokenInfo.access_token

	var products = await listProducts(token)
	//console.log("products", JSON.stringify(products, null, 1))
	var gs_products = _.map(products, p => mapProductToGS(p, mapping))
	//console.log("\n\nto gs", _(gs_products).map("product_ref").uniq().value().join("\n"))
	console.log("\n\nto gs", gs_products)
}


var create = function() {
	akeneoGsDB.findOneAndUpdate({account_id:account_id}
			, {account_id:account_id 
			,  gs_token : config.gs.token //Token obtained from Grand Shooting admin console 
			,  gs_api_url: config.gs.api_url}
			, {upsert:true}).exec()
		.then(res => console.log("res", res))
}
var testInfos = async function() {
	await create()
	await api.auth(account_id, config)
	await api.storeMapping(account_id, mapping)
	await api.synchroCatalog(account_id)
	//  await api.broadcastToAssetResource(account_id)
	//	await api.broadcast(account_id)
}
testInfos()