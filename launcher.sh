START_PAGE=${START_PAGE:-0}
END_PAGE=${END_PAGE:-100}
PAGES_PER_BOT=${PAGES_PER_BOT:-10}
KEY_LOC=${KEY_LOC:-liquidator-key.json}

echo "start page: $START_PAGE"
echo "end page: $END_PAGE"
echo "pages per bot: $PAGES_PER_BOT"
echo "key location: $KEY_LOC"

# If there's a missing process, restart it
while true
do
    for (( i=$START_PAGE; i<END_PAGE; i+=$PAGES_PER_BOT ))
    do
        SIG_STR=$(echo "LIQUIDATOR_AT_$i")
        exists=$(ps aux | grep node | grep "$SIG_STR")
        if [ -z "$exists" ]
        then
            # re-launch the script
            echo "Launching bot starting at $i"
            node ./dist/index.js public $KEY_LOC $i $(($i + $PAGES_PER_BOT)) $SIG_STR >> $SIG_STR.log &
        fi
    done
    date
    sleep 10
done
