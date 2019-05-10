FROM mhart/alpine-node:11

MAINTAINER samparsky@gmail.com

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

WORKDIR /app 

EXPOSE ${PORT}

ADD . .

RUN npm install && npm install -g pm2

CMD pm2 start -x bin/validatorWorker.js -- --adapter=${ADAPTER} --keystoreFile=${KEYSTORE_FILE} --keystorePwd=${KEYSTORE_PASSWORD} && \
    PORT=${PORT} pm2-docker start bin/sentry.js -- --adapter=${ADAPTER} --keystoreFile=${KEYSTORE_FILE}
    
