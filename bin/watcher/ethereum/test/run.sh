#/usr/bin/env bash

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

sleep 3

TIMESTAMP=`date +%s`
DATABASE="testing${TIMESTAMP}"

# run the bin work
DB_MONGO_NAME=$DATABASE ./watcher.js >> test.out &

sleep 3

# migrate contracts to the network
cd ./node_modules/adex-protocol-eth && ../../node_modules/.bin/truffle migrate --reset --network development

# change directory
cd ../../

# seed mongo database
# cause we need the deployed contract
# address hence why seeding after migration
node ./test/prep-db/mongo.js && mongo $DATABASE ./test/prep-db/seed.js

# remove seed file
rm ./test/prep-db/seed.js

# run tests to create LogChannelOpen event
cd ./node_modules/adex-protocol-eth && ../../node_modules/.bin/truffle test --network development

# run tests to confirm it worked as scheduled

# sleep 3
pkill -P $$
