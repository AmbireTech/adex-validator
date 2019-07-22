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
    apk upgrade --update && \ 
    apk add mongodb

RUN apk add --update alpine-sdk
RUN apk add --update python

RUN curl 'https://support.cloudflare.com/hc/en-us/article_attachments/360033402631/cloudflare_origin_ecc.pem' > /usr/local/share/ca-certificates/cloudflare_origin_ecc.crt && curl 'https://support.cloudflare.com/hc/en-us/article_attachments/360033413832/cloudflare_origin_rsa.pem' > /usr/local/share/ca-certificates/cloudflare_origin_rsa.crt && update-ca-certificates

ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/cloudflare_origin_rsa.crt

WORKDIR /app 

EXPOSE ${PORT}

ADD . .

RUN npm install --production

CMD PORT=${PORT} node bin/sentry.js --adapter=${ADAPTER} --keystoreFile=${KEYSTORE_FILE} --clustered
