#!/usr/bin/env bash

# launch test rpc instance
testrpc_port=8545

testrpc_running() {
  nc -z localhost "$testrpc_port"
}

start_testrpc(){
    local accounts=(
        --account="0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501200,9000000000000000000000000000"
        --account="0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501201,9000000000000000000000000000"
        --account="0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501202,9000000000000000000000000000"
        --account="0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501203,9000000000000000000000000000"
        --account="0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501204,9000000000000000000000000000"
        --account="0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501205,9000000000000000000000000000"
        --account="0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501206,9000000000000000000000000000"
        --account="0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501207,9000000000000000000000000000"
        --account="0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501208,9000000000000000000000000000"
        --account="0x2bdd21761a483f71054e14f5b827213567971c676928d9a1808cbfa4b7501209,9000000000000000000000000000"
    )
    node_modules/.bin/ganache-cli --port $testrpc_port --gasLimit 0xfffffffffffff "${accounts[@]}" > /dev/null &
    testrpc_pid=$!
}

if testrpc_running; then
  echo "Using existing testrpc instance"
else
  echo "Starting our own testrpc instance"
  start_testrpc
fi

# let ganache start
sleep 3 

# build contracts
cd ./node_modules/adex-protocol-eth/ &&  ../.bin/truffle build && cd ../../

TIMESTAMP=`date +%s`
DATABASE="testing${TIMESTAMP}"

# run the bin work
DB_MONGO_NAME=$DATABASE ./watcher.js >> /dev/null &

# allow startup 
sleep 3

echo "-------- Setting up contracts --------"
# setup the contracts
node ./test/setup/setup.js

echo "-------- Seeding database --------"
# seed mongo database
# cause we need the deployed contract
# address hence seeding after setting up contracts
node ./test/prep-db/mongo.js && mongo $DATABASE ./test/prep-db/seed.js


echo "-------- Open Channel --------"
# create channel to emit LogChanelOpen event
node ./test/setup/channelOpen.js

# allow watcher to pick up and process the event
sleep 10

echo "-------- Running Tests --------"
# run tests to confirm it worked as scheduled
DB_MONGO_NAME=$DATABASE ./test/index.js
# set exitcode to status of previous command
exitCode=$?

pkill -P $$

# cleanup
rm ./test/mocks/*.json
rm ./test/prep-db/seed.js  # remove seed file
mongo $DATABASE --eval 'db.dropDatabase()' >/dev/null # drop database

exit $exitCode