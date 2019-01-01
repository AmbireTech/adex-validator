#/usr/bin/env bash

MONGO_OUT=/dev/null # could be &1

TIMESTAMP=`date +%s`

LEAD_PORT=8005
LEAD_MONGO="testValStackLeader${TIMESTAMP}"
LEAD_ARGS="--adapter=dummy --dummyIdentity=awesomeLeader"

FOLLOW_PORT=8006
FOLLOW_MONGO="testValStackFollower${TIMESTAMP}"
FOLLOW_ARGS="--adapter=dummy --dummyIdentity=awesomeFollower"

# Seeding the database
echo "Using MongoDB database names: $LEAD_MONGO, $FOLLOW_MONGO"
# awesomeLeader, awesomeFollower and all the channels are seeded in the prep-db
mongo $LEAD_MONGO ./test/prep-db/mongo.js >$MONGO_OUT
mongo $LEAD_MONGO ./scripts/db-indexes.js >$MONGO_OUT
mongo $FOLLOW_MONGO ./test/prep-db/mongo.js >$MONGO_OUT
mongo $FOLLOW_MONGO ./scripts/db-indexes.js >$MONGO_OUT

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
	echo "cleaning up DB"
	mongo $LEAD_MONGO --eval 'db.dropDatabase()' >$MONGO_OUT
	mongo $FOLLOW_MONGO --eval 'db.dropDatabase()' >$MONGO_OUT
else
	echo -e "\033[0;31mTests failed: waiting 60s before cleaning the database (press ctrl-C to avoid cleanup)\033[0m"
	echo "MongoDB database names: $LEAD_MONGO, $FOLLOW_MONGO"
	(
		sleep 60 &&
		mongo $LEAD_MONGO --eval 'db.dropDatabase()' >$MONGO_OUT &&
		mongo $FOLLOW_MONGO --eval 'db.dropDatabase()' >$MONGO_OUT
	)
fi

