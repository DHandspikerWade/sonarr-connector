FROM nginx:stable-bullseye
LABEL maintainer="DHandspikerWade"

RUN apt-get update && apt-get install -y -q --no-install-recommends locales \
    && sed -i 's/^# *\(en_US.UTF-8\)/\1/' /etc/locale.gen \
    && locale-gen \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/share/doc/* \
    && rm -rf /usr/share/man/*

ENV LC_ALL en_US.UTF-8
ENV LANG en_US.UTF-8
ENV LANGUAGE en_US.UTF-8

RUN apt-get update && apt-get install -y -q --no-install-recommends ca-certificates curl gnupg cron mktorrent ffmpeg python3 \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/share/doc/* \
    && rm -rf /usr/share/man/*

# Install NodeJS 18 LTS from nodesource
RUN mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_18.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update && apt-get install -y -q --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/share/doc/* \
    && rm -rf /usr/share/man/*

RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/bin/yt-dlp && \
    chmod a+rx /usr/bin/yt-dlp && yt-dlp --version
    
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

ARG BUILD_DATE
ARG GIT_COMMIT

LABEL org.opencontainers.image.base.name="nginx:stable-bullseye"
LABEL org.opencontainers.image.created=$BUILD_DATE
LABEL org.opencontainers.image.revision=$GIT_COMMIT