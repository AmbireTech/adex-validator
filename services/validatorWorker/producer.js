const db = require('../../db')

// @TODO: keep the latest state (or get it from the db), reap unprocessed eventAggregates from oldest to newest; then in 1 atomic process, mark them as reaped and write the new state
function tick() {
}

module.exports = { tick }
