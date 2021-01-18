#!/bin/bash

OUTPUT='/usr/share/nginx/html/sonarr/'
SEED="https://${SEED_HOST}/sonarr/"

if [ ! -f /app/nhk.json ]
then
    echo '{}' > /app/nhk.json
fi

mkdir -p $OUTPUT

. $HOME/.bashrc

touch ${OUTPUT}archive.txt
find $OUTPUT* -mtime +5 -exec rm -f {} \;

#cd /tmp/ && npm ci --quiet > /dev/null && \
cd /tmp/ && \
node /app/download.js --copy 'cp' --http "$SEED" --output "$OUTPUT"

sh ./nhk.sh
rm nhk.sh
