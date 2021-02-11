#!/bin/bash

OUTPUT='/usr/share/nginx/html/sonarr/'
SEED="https://${SEED_HOST}/sonarr/"

if [ ! -f /app/youtube.json ]
then
    echo '{}' > /app/youtube.json
fi

find $OUTPUT* -mtime +5 -not -name "*.json" -exec rm -f {} \;
node /app/youtube.js --copy 'cp' --http "$SEED" --output "$OUTPUT"

