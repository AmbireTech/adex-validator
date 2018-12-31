#!/usr/bin/env node
const tape = require('tape')

tape('connects to sentry', function(t) {
	t.end()
})

// @TODO can't trick with negative values
// @TODO cannot excdeed deposits
// @TODO can't submit states that aren't signed and valid (everything re msg propagation)
