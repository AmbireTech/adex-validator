#/usr/bin/env bash

MONGO_OUT=/dev/null # could be &1

TIMESTAMP=`date +%s`

SUBCOMMAND=$1

LEAD_PORT=8005
LEAD_MONGO="testValStackLeader${TIMESTAMP}"
LEAD_ARGS="--adapter=dummy --dummyIdentity=0xce07CbB7e054514D590a0262C93070D838bFBA2e"

FOLLOW_PORT=8006
FOLLOW_MONGO="testValStackFollower${TIMESTAMP}"
FOLLOW_ARGS="--adapter=dummy --dummyIdentity=0xC91763D7F14ac5c5dDfBCD012e0D2A61ab9bDED3"

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
sleep 2

# Run the integration tests
if [ "$SUBCOMMAND" == "benchmark" ]; then
	echo "Running benchmark"
	./test/benchmark/benchmark.sh
else 
	# start ganache cli 
	# Ethereum local testnet
	echo "Starting Ethereum"
	./test/scripts/ethereum.sh

	# Run integration & prune tests
	echo "Starting tests"
	./test/distribute-lp-reward.js && ./test/routes.js  && ./test/ethereum_adapter.js && ./test/integration.js && ./test/access.js && DB_MONGO_NAME=$LEAD_MONGO ./test/prune.js && DB_MONGO_NAME=$LEAD_MONGO ./test/analyticsAggregator.js

fi

exitCode=$?

# end all jobs (sentries, workers)
pkill -P $$

if [ $exitCode -eq 0 ]; then
	echo "cleaning up DB"
	mongo $LEAD_MONGO --eval 'db.dropDatabase()' >$MONGO_OUT
	mongo $FOLLOW_MONGO --eval 'db.dropDatabase()' >$MONGO_OUT
else
	echo -e "\033[0;31mTests failed: waiting 20s before cleaning the database (press ctrl-C to avoid cleanup)\033[0m"
	echo "MongoDB database names: $LEAD_MONGO, $FOLLOW_MONGO"
	(
		sleep 20 &&
		mongo $LEAD_MONGO --eval 'db.dropDatabase()' >$MONGO_OUT &&
		mongo $FOLLOW_MONGO --eval 'db.dropDatabase()' >$MONGO_OUT
	)
fi

exit $exitCode
