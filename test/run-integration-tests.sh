#/usr/bin/env bash

TIMESTAMP=`date +%s`

# awesomeLeader, awesomeFollower and all the channels are seeded in the prep-db

LEAD_PORT=8005
LEAD_MONGO="testValStackLeader${TIMESTAMP}"
LEAD_ARGS="--adapter=dummy --dummyIdentity=awesomeLeader"

FOLLOW_PORT=8006
FOLLOW_MONGO="testValStackFollower${TIMESTAMP}"
FOLLOW_ARGS="--adapter=dummy --dummyIdentity=awesomeFollower"

# Seeding the database
echo "Using MongoDB database names: $LEAD_MONGO, $FOLLOW_MONGO"
# @TODO seed database

# @TODO separate logs
# Start sentries
PORT=$LEAD_PORT DB_MONGO_NAME=$LEAD_MONGO bin/sentry.js $LEAD_ARGS &
PORT=$FOLLOW_PORT DB_MONGO_NAME=$FOLLOW_MONGO bin/sentry.js $FOLLOW_ARGS &
# the sentries need time to start listening
sleep 3

# Start workers
DB_MONGO_NAME=$LEAD_MONGO bin/validatorWorker.js $LEAD_ARGS &
DB_MONGO_NAME=$FOLLOW_MONGO bin/validatorWorker.js $FOLLOW_ARGS &

# Run the integration tests
./test/integration.js
exitCode=$?

# end all jobs (sentries, workers)
pkill -P $$

if [ $exitCode -eq 0 ]; then
	echo "must cleanup DB"
	# @TODO
else
	echo -e "\033[0;31mTests failed, not cleaning up DB\033[0m"
	echo "MongoDB database names: $LEAD_MONGO, $FOLLOW_MONGO"
fi


# @TODO: cleanup mongo, but only on success
