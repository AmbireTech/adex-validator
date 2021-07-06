/* eslint-disable no-undef */
db.channels.createIndex({ validUntil: 1, 'spec.validators.id': 1 })
db.eventAggregates.createIndex({ channelId: 1 })
db.eventAggregates.createIndex({ created: 1 })
db.eventAggregates.createIndex({ channelId: 1, created: 1 })
db.eventAggregates.createIndex({ earners: 1, created: 1 })
db.validatorMessages.createIndex({ channelId: 1 })
db.validatorMessages.createIndex({ received: 1 })
db.validatorMessages.createIndex({ 'msg.type': 1, 'msg.stateRoot': 1 }, { sparse: true })
db.validatorMessages.createIndex({ channelId: 1, from: 1, 'msg.type': 1, received: 1 })
db.validatorMessages.createIndex({ channelId: 1, from: 1, received: 1 })
db.rewardChannels.createIndex({ periodStart: -1 })

// V5 analytics
db.analytics.createIndex({ keys: 1 })
db.analytics.createIndex({ 'keys.publisher': 1, 'keys.time': 1 })
db.analytics.createIndex({ 'keys.advertiser': 1, 'keys.time': 1 })
db.analytics.createIndex({ 'keys.campaignId': 1, 'keys.time': 1 })

// OBSOLETE V4 stuff
db.analyticsAggregates.createIndex({ channelId: 1 })
db.analyticsAggregates.createIndex({ created: 1 })
db.analyticsAggregates.createIndex({ channelId: 1, created: 1 })
db.analyticsAggregates.createIndex({ earners: 1, created: 1 })
