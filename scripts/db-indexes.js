/* eslint-disable no-undef */
db.channels.createIndex({ validUntil: 1, 'spec.validators.id': 1 })
db.eventAggregates.createIndex({ channelId: 1 })
db.eventAggregates.createIndex({ channelId: 1, created: 1 })
db.validatorMessages.createIndex({ channelId: 1 })
db.validatorMessages.createIndex({ 'msg.type': 1, 'msg.stateRoot': 1 }, { sparse: true })
db.validatorMessages.createIndex({ channnelId: 1, from: 1, 'msg.type': 1, received: 1 })
db.validatorMessages.createIndex({ channnelId: 1, from: 1, received: 1 })
