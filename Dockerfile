FROM mhart/alpine-node:11

MAINTAINER samparsky@gmail.com

ARG ARG_PORT=8005
ARG ARG_ADAPTER=dummy
ARG ARG_IDENTITY=awesomeLeader

ENV PORT=$ARG_PORT
ENV ADAPTER=$ARG_ADAPTER
ENV IDENTITY=$ARG_IDENTITY

RUN echo 'http://dl-3.alpinelinux.org/alpine/edge/testing' >> /etc/apk/repositories && \
    apk upgrade --update && \ 
    apk add mongodb 

WORKDIR /app 

RUN apk add --no-cache bash git openssh

ADD . .

RUN mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo -e "Host *\n\tStrictHostKeyChecking no\n\n" > ~/.ssh/config

RUN npm install && npm install -g pm2

EXPOSE ${PORT}

CMD pm2 start bin/validatorWorker.js -- --adapter=${ADAPTER} --dummyIdentity=${IDENTITY} && \
    PORT=${PORT} pm2 start bin/sentry.js -- --adapter=${ADAPTER} --dummyIdentity=${IDENTITY}
