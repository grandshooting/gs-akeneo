# Grand-Shooting - Akeneo integration

Grand-Shooting (GS) and Akeneo both provide a REST API to manipulate catalog and media information.
This component will use both APIs to integrate the 2 systems through 2 dataflows :
 - load catalog information from Akeneo to Grand-Shooting in order to prepare, check and validate media production
 - send validated media from Grand-Shooting to Akeneo in order to centralize in Akeneo all catalog information

Integration options are:
 - Call akeneo REST API to get catalog information VS be notified through webhooks
 - Send media in asset families or directly in image typed fields


## Installation

    npm install
    
A mongo database is used to store configuration information

## Configuration

config.sample.js should be renamed to config.js and modified with auth information and specific urls

### Catalog mapping

An exemple of initialization is present in init_configuration_exemple.js. Modify it and run it to setup you integration.
Catalog entry are used to configure how Akeneo catalog structure is mapped to GS catalog.

    {
        catalog : { //Mapping between Akeneo column and GS column
            name : "smalltext", //Akeneo name field is mapped to smalltext GS field
            collections: {col:"collection"}, //Akeneo name field is mapped to smalltext GS field
            sector : {col:"univers", isAttribute:true},
            identifier : {col:"skus", root:true, mult:true, extra:true}, //extra : means it is an extra column in GS
            ean : {col:"eans", mult:true},
            parent : {col:"ref", root:true},
            brand : {reference_entity:"brand", col:"brand" }, //{col : "brand", isAttribute:true},
            main_gender : {col:"gender", isAttribute:true},
            title : "smalltext",
            ref_model : "product_ref",
            comment_mel : "comment",
            //      refcolor_col : "ref",
            color_comments : {col:"color"}
        },
        default_lang : "fr_FR", //Wich lang from Akeneo is sent to GS
        asset_families : ["Packshot", "Model", "Partners"], //Name of the asset families
        //If you don't map media with asset families, you can save them directly in product columns
        images : { 
            "1" : "image_1", //view_type_code 1 in GS is save in "image_1" column in Akeneo product
            "2" : "image_2",
            "3" : "image_3",
        },
        broadcast_status : [50, 52] //picturestatus that are downloaded and sent to Akeneo
    }

Catalog mapping options : 
 - isAttribute : column in Akeneo is an attribute
 - root : column in Akeneo is on the product-model level
 - mult : column is a list of values in Akeneo that are linked to a list in GS
 - reference_entity : column in Akeneo is a link to a reference entity, we store the reference entity label in GS
 - extra : column in GS is an extra column (not a standard column information) 
 
### Webhook settings

server.js is a web server running with expressjs. It defines 1 endpoint to receive Akeneo webhook notifications

    app.post('/gs-akeneo/webhook/:account_id/', async (req, res) => { ...

## References : 

Grand-Shooting API Documentation : https://api.grand-shooting.com/
Akeneo API Documentation : https://api.akeneo.com/

License : Apache License 2.0