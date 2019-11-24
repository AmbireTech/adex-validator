FROM node:10-alpine

MAINTAINER dev@adex.network

ENV PORT=
ENV ADAPTER=
ENV IDENTITY=
ENV DB_MONGO_URL=
ENV DB_MONGO_NAME=
ENV KEYSTORE_FILE=
ENV KEYSTORE_PASSWORD=

RUN echo 'http://dl-3.alpinelinux.org/alpine/edge/testing' >> /etc/apk/repositories && \
    apk upgrade --update

RUN apk add --update alpine-sdk
RUN apk add --update python

COPY cloudflare_origin.crt /usr/local/share/ca-certificates/

RUN update-ca-certificates

ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/cloudflare_origin.crt

WORKDIR /app 

EXPOSE ${PORT}

ADD . .

RUN npm install --production

CMD PORT=${PORT} node bin/sentry.js --adapter=${ADAPTER} --keystoreFile=${KEYSTORE_FILE} --clustered
