FROM mhart/alpine-node:11

MAINTAINER samparsky@gmail.com

ARG ARG_PORT=8005
ARG ARG_ADAPTER=dummy
ARG ARG_IDENTITY=awesomeLeader

ENV PORT=$ARG_PORT
ENV ADAPTER=$ARG_ADAPTER
ENV IDENTITY=$ARG_IDENTITY
ENV DB_MONGO_URL=
ENV DB_MONGO_NAME=

RUN echo 'http://dl-3.alpinelinux.org/alpine/edge/testing' >> /etc/apk/repositories && \
    apk upgrade --update && \ 
    apk add mongodb 

WORKDIR /app 

RUN apk add --no-cache bash git openssh

RUN mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo -e "Host *\n\tStrictHostKeyChecking no\n\n" > ~/.ssh/config

EXPOSE ${PORT}

ADD . .

RUN npm install && npm install -g pm2

CMD pm2 start -x bin/validatorWorker.js -- --adapter=${ADAPTER} --dummyIdentity=${IDENTITY} && \
    PORT=${PORT} pm2-docker start bin/sentry.js -- --adapter=${ADAPTER} --dummyIdentity=${IDENTITY}
    
