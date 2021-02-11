#!/bin/bash

OUTPUT='/usr/share/nginx/html/sonarr/'
SEED="https://${SEED_HOST}/sonarr/"

if [ ! -f /app/nhk.json ]
then
    echo '{}' > /app/nhk.json
fi

find $OUTPUT* -mtime +5 -not -name "*.json" -exec rm -f {} \;
node /app/nhk.js --copy 'cp' --http "$SEED" --output "$OUTPUT"
