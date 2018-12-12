#!/usr/bin/env bash

mongo adexValidator ./test/prep-db/mongo.js
mongo adexValidator ../../scripts/db-indexes.js
mongo adexValidatorFollower ./test/prep-db/mongo.js
mongo adexValidatorFollower ../../scripts/db-indexes.js
