#!/usr/bin/env node

const tape = require('tape')
const db = require('../../../../db')
const cfg = require('../cfg')

tape('Should remove old pending channel', function(t){
    db.connect()
    .then(function(){
        const channelCol = db.getMongo().collection('channels')
        channelCol.find()
        .toArray()
        .then(function(data){

            // check the status should all be active
            data.forEach(element => {
               // all present data should not have expired time less than 
               // or equal to the configured evict threshold
               const elementTime = new Date(element.created)
               const currentTime = new Date()

               const diff = Math.floor((currentTime - elementTime) / 86400000)
               t.equal(diff < cfg.EVICT_THRESHOLD, true, "Should remove all old pending channels")
            });
            
            t.equal(data.length, 1, 'Should have a single valid channel')

            t.end()
            // close connection
            db.close()
        })
    })
    .catch(err => t.fail(err))
})

tape('Should update pending channel to active', function(t) {
    db.connect()
    .then(function(){
        const channelCol = db.getMongo().collection('channels')
        channelCol.find()
        .toArray()
        .then(function(data){
            // check the status should all be active
            data.forEach(element => {
                t.equal(element.status, 'active', 'Channel status should be updated to active')
            });
            t.end()
            // close connection
            db.close()
        })
    })
    .catch(err => t.fail(err))
})