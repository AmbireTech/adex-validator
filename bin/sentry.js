#!/usr/bin/env node
const express = require('express')
const app = express()
const port = 8005

app.get('/hello', (req, res) => res.send([]))

app.listen(port, () => console.log(`Example app listening on port ${port}!`))
