
const { Joi } = require('celebrate');

function _depositAsset({ TOKEN_ADDRESS_WHITELIST }){
    let schema = Joi.string().required()
    if( TOKEN_ADDRESS_WHITELIST && TOKEN_ADDRESS_WHITELIST.length > 0 ){
        schema = schema.valid(TOKEN_ADDRESS_WHITELIST)
    }
    return schema
}

function _depositAmount({ MINIMAL_DEPOSIT  }){
    let schema = Joi.number().required()
    if( MINIMAL_DEPOSIT > 0 ){
        schema = schema.min(MINIMAL_DEPOSIT)
    }
    return schema
}

function _creator({ CREATORS_WHITELIST }){
    let schema = Joi.array().items(Joi.string().required(), Joi.string().required()).length(2)
    if(CREATORS_WHITELIST && CREATORS_WHITELIST.length > 0 ){
        // schema = schema.valid(CREATORS_WHITELIST)
        schema = schema.has(CREATORS_WHITELIST)
    }
    return schema

}

module.exports = {
    createCampaign: (cfg) => ({
        "id": Joi.string().required(),
        "depositAsset":  _depositAsset(cfg),
        "depositAmount": _depositAmount(cfg),
        "validators":   _creator(cfg), 
        "spec" : Joi.object({ 
            "validators" : Joi.array().items(
                Joi.object({
                    "id": Joi.string().required(),
                    "url": Joi.string().uri({
                        scheme: ['http', 'https']
                    }).required(),
                    "fee": Joi.number().required()
                })
            ).min(2).max(2)
        }),
        "watcher": Joi.object({
            "ethereum": Joi.object({
                "contract": Joi.string().required()
            })
        })
    }),
    validateCampaign: (cfg) => ({
        "id" : Joi.string().required(),
        "depositAsset":  _depositAsset(cfg),
        "depositAmount": _depositAmount(cfg),
        "role": Joi.string().required().valid(["leader", "follower"]),
        "validators": Joi.array().items(Joi.string()),
        "spec" : Joi.object({ 
            "validators" : Joi.array().items(
                Joi.object({
                    "id": Joi.string().required(),
                    "url": Joi.string().uri({
                        scheme: ['http', 'https']
                    }).required(),
                    "fee": Joi.number().required()
                })
            ).length(2)
        })
    })
}
