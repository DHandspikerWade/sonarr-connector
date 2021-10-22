#!/bin/bash
echo "Docker container has been started"

touch $HOME/.env
echo "export LC_ALL=en_US.UTF-8" >> $HOME/.env
echo "export LANG=en_US.UTF-8" >> $HOME/.env
echo "export LANGUAGE=en_US.UTF-8" >> $HOME/.env
echo "export SONARR_HOST=${SONARR_HOST}" >> $HOME/.env
echo "export SONARR_KEY=${SONARR_KEY}" >> $HOME/.env
echo "export SEED_HOST=${SEED_HOST}" >> $HOME/.env
echo "" >> $HOME/.env

touch /var/log/cron.log
chmod +x /app/{nhk,youtube}.sh

# Start a another shell to work around crond's minimum environment. Just makes testing easier as cron would same env as running it manually
echo "0 5 * * * sh -c '. $HOME/.env; /app/nhk.sh >> /var/log/cron.log 2>&1'
0 10 * * */3 sh -c '. $HOME/.env; /app/youtube.sh >> /var/log/cron.log 2>&1'
# This extra line makes it a valid cron" > /app/scheduler.txt
crontab /app/scheduler.txt

service cron start

echo $@
exec "$@"