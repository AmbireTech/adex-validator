#/usr/bin/env bash

TIMESTAMP=`date +%s`

# awesomeLeader, awesomeFollower and all the channels are seeded in the prep-db

LEAD_PORT=8201
LEAD_MONGO="testValStackLeader${TIMESTAMP}"
LEAD_ARGS="--adapter=dummy --dummyIdentity=awesomeLeader"

FOLLOW_PORT=8202
FOLLOW_MONGO="testValStackFollower${TIMESTAMP}"
FOLLOW_ARGS="--adapter=dummy --dummyIdentity=awesomeFollower"

echo "Using MongoDB database names: $LEAD_MONGO, $FOLLOW_MONGO"

# @TODO separate logs
# Start sentries
PORT=$LEAD_PORT DB_MONGO_NAME=$LEAD_MONGO bin/sentry.js $LEAD_ARGS &
PORT=$FOLLOW_PORT DB_MONGO_NAME=$FOLLOW_MONGO bin/sentry.js $FOLLOW_ARGS &
# the sentries need time to start listening
sleep 3

# Start workers
DB_MONGO_NAME=$LEAD_MONGO bin/validatorWorker.js $LEAD_ARGS &
DB_MONGO_NAME=$FOLLOW_MONGO bin/validatorWorker.js $FOLLOW_ARGS &

echo "running both"
sleep 10

pkill -P $$

# @TODO: cleanup mongo, but only on success
