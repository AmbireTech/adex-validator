
const cfg = require('../cfg')
const { Joi } = require('celebrate');


function _depositAsset({ TOKEN_ADDRESS_WHITE_LIST }){
    let schema = Joi.string().required()
    if( TOKEN_ADDRESS_WHITE_LIST.length > 0 ){
        schema = schema.valid(TOKEN_ADDRESS_WHITE_LIST)
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

function _creator({ CREATORS_WHITE_LIST }){
    let schema = Joi.array().items(Joi.string().required(), Joi.string().required()).min(2).max(2)
    if( CREATORS_WHITE_LIST.length > 0 ){
        schema = schema.valid(CREATORS_WHITE_LIST)
    }
    return schema

}

const depositAmount = _depositAmount(cfg)
const depositAsset = _depositAsset(cfg)
const creator = _creator(cfg)

module.exports = {
    campaign: {
        "id" : Joi.string().required(),
        depositAsset,
        depositAmount,
        "validators" : creator, 
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
    },
    campaignValidate: {
        "id" : Joi.string().required(),
        depositAsset,
        depositAmount,
        "role": Joi.string().required(),
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
            ).min(2).max(2)
        })
    }
}
