
const tape = require('tape')
const db = require('../../../../db')
tape('Should update pending channel', function(t) {
    db.connect()
    .then(function(){
        const channelCol = db.getMongo().collection('channel')
        channelCol
    })
})