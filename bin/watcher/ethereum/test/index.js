#!/usr/bin/env node

const tape = require('tape')
const db = require('../../../../db')

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