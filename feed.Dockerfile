FROM golang:alpine as build
ENV USER=appuser
ENV UID=10001 

# See https://stackoverflow.com/a/55757473/12429735
RUN adduser \    
    --disabled-password \    
    --gecos "" \    
    --home "/nonexistent" \    
    --shell "/sbin/nologin" \    
    --no-create-home \    
    --uid "${UID}" \    
    "${USER}"

COPY feed.go /tmp/
RUN cd /tmp/ && GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o /tmp/feed ./feed.go && chmod +x /tmp/feed


FROM alpine:latest

VOLUME /data
ARG BUILD_DATE

COPY --from=build /etc/passwd /etc/passwd
COPY --from=build /etc/group /etc/group
COPY --from=build /tmp/feed /bin/nhk-feed

USER appuser:appuser

EXPOSE 5000

WORKDIR /data

ENTRYPOINT ["/bin/nhk-feed"]
