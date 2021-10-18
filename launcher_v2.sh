KEY_LOC=${KEY_LOC:-liquidator-key.json}

echo "key location: $KEY_LOC"

# If there's a missing process, restart it
while true
do
    for endpoint in apricot_ept serum_ept
    do
        SIG_STR=$(echo "LIQUIDATOR_AT_$endpoint")
        exists=$(ps aux | grep node | grep "$SIG_STR")
        if [ -z "$exists" ]
        then
            # re-launch the script
            echo "Launching bot starting at $endpoint"
            node ./dist/index.js public $KEY_LOC 0 0 $endpoint $SIG_STR | tee -a $SIG_STR.log &
            # sleep 10 seconds to avoid connection rush
            sleep 10
        fi
    done
    date
    sleep 10
done
