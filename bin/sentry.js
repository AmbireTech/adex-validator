#!/usr/bin/env node
const express = require('express')
const channelRoutes = require('../routes/channel')

const app = express()
const port = process.env.PORT || 8005

app.use('/channel', channelRoutes)

app.listen(port, () => console.log(`Sentry listening on port ${port}!`))
