#/usr/bin/env bash

Description


Prune heartbeat validatorMessages from the database
An optional database and date param can be passed or it prunes HeartBeat messages
that are less than the current date and uses adexValidator as its default database


Options
------------------------------------
timestamp ( default= current date ) e.g. 2015-01-01
channel (required)
database (required) (default = adexValidator)
expired (optional) (values = true ) IMPORTANT: if set deletes all validator messages should be used for expired channelsonly


Example

Delete Heartbeat messages from a specific date
./sccripts/prune.sh -database testValStackLeader1558782672 -timestamp 2012-01-01 -channel testing

Delete validator Messages for epxired channel
./sccripts/prune.sh testValStackLeader1558782672 -expired true -channel testing



DB_MONGO_NAME=''
TIMESTAMP=`date +”%Y-%m-%d”`
CHANNEL=''
# flag to delete all validator messages
EXPIRED=0

# parse flags
while test $# -gt 0; do
    case "$1" in
        -channel)
            shift
            CHANNEL=$1
            shift
            ;;
        -database)
            shift
            DB_MONGO_NAME=$1
            shift
            ;;
        -timestamp)
            shift
            TIMESTAMP=$1
            shift
            ;;
        -expired)
            shift
            EXPIRED=1
            shift
            ;;
    esac
done

if [[ $CHANNEL == '' || $DB_MONGO_NAME == '' ]]; then
    echo -e "\033[0;31m Please specify a channel and database name \033[0m"
    exit 1
fi

if [[ $EXPIRED -eq 0 ]]; then
    echo "Deleting heartbeat validator messages for database $DB_MONGO_NAME channel $CHANNEL"
    mongo $DB_MONGO_NAME --eval "db.validatorMessages.deleteMany({ channelId: '$CHANNEL', 'msg.type': 'HeartBeat', 'received': { '$lt': new Date('$TIMESTAMP') }})"
else
    echo "Waiting 2secs before deleting all validator messages for database $DB_MONGO_NAME channel $CHANNEL"
    sleep 2
    mongo $DB_MONGO_NAME --eval "db.validatorMessages.deleteMany({ channelId: '$CHANNEL' })"
fi

exit 0