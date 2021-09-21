FROM nginx:stable
LABEL maintainer="Handspiker2"

RUN apt-get update && apt-get install -y -q --no-install-recommends locales \
    && sed -i 's/^# *\(en_US.UTF-8\)/\1/' /etc/locale.gen \
    && locale-gen \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/share/doc/* \
    && rm -rf /usr/share/man/*

ENV LC_ALL en_US.UTF-8
ENV LANG en_US.UTF-8
ENV LANGUAGE en_US.UTF-8

RUN apt-get update && apt-get install -y -q --no-install-recommends mktorrent cron curl ffmpeg \
    && curl -sL https://deb.nodesource.com/setup_14.x | bash - \
    && apt-get install -y nodejs \
    && node -v \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/share/doc/* \
    && rm -rf /usr/share/man/*

# Debian no longer has a `python` command but youtube-dl still uses it
RUN ln -s /usr/bin/python3 /usr/local/bin/python

RUN curl -L https://yt-dl.org/downloads/latest/youtube-dl -o /usr/bin/youtube-dl && \
    chmod a+rx /usr/bin/youtube-dl && \
    youtube-dl --version
    
COPY package*.json /app/
RUN cd /app/ && npm ci
COPY *.json *.js *.sh /app/
WORKDIR /data
ENTRYPOINT [ "/app/run.sh" ]
CMD ["nginx", "-g", "daemon off;"]

EXPOSE 80

ENV SONARR_HOST ''
ENV SONARR_KEY ''
ENV SEED_HOST ''