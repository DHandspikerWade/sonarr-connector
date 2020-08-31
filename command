#!/bin/bash

OUTPUT='/usr/share/nginx/html/sonarr/'
SEED="https://${SEED_HOST}/sonarr/"

mkdir -p $OUTPUT

. $HOME/.bashrc

touch ${OUTPUT}archive.txt
find $OUTPUT* -mtime +5 -exec rm -f {} \;

#cd /tmp/ && npm ci --quiet > /dev/null && \
cd /tmp/ && \
node /app/download.js --copy 'cp' --slug dwc --show 209 --http "$SEED" --output "$OUTPUT" && \
node /app/download.js --copy 'cp' --slug japanologyplus --show 144 --append --http "$SEED" --output "$OUTPUT" && \
node /app/download.js --copy 'cp' --slug hashtagtokyo --show 309 --append --http "$SEED" --output "$OUTPUT" && \
node /app/download.js --copy 'cp' --slug 72hours --show 287 --append --http "$SEED" --output "$OUTPUT" && \ 
node /app/download.js --copy 'cp' --slug lunchon --show 324 --append --http "$SEED" --output "$OUTPUT";

sh ./script.sh 