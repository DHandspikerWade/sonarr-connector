#!/bin/bash

OUTPUT='/usr/share/nginx/html/sonarr/'
SEED="https://${SEED_HOST}/sonarr/"

if [ ! -f /app/youtube.json ]
then
    echo '{}' > /app/youtube.json
fi

mkdir -p $OUTPUT

. $HOME/.bashrc

touch ${OUTPUT}archive.txt
find $OUTPUT* -mtime +5 -exec rm -f {} \;

cd /tmp/ && \
node /app/youtube.js --copy 'cp' --http "$SEED" --output "$OUTPUT"

if [ -z "$DEBUG" ]
then
    sh ./youtube.sh
    rm youtube.sh
else
    cp youtube.sh "$OUTPUT"
fi
