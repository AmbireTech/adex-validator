#!/usr/bin/env bash

mongo adexValidator ./test/prep-db/mongo.js
mongo adexValidatorFollower ./test/prep-db/mongo.js
