FROM node:14-alpine as build

RUN apk add sqlite
USER node
RUN mkdir /home/node/tfc
ADD package.json /home/node/tfc/package.json
ADD yarn.lock /home/node/tfc/
WORKDIR /home/node/tfc
RUN yarn install
USER root
RUN chown node /home/node/tfc
USER node
RUN mkdir dist
ADD stations.sqlite* /home/node/tfc/dist/
USER root
RUN chown node /home/node/tfc/dist/*
USER node
RUN sqlite3 dist/stations.sqlite VACUUM
ADD . /home/node/tfc
RUN cp -r www dist/
RUN ./node_modules/.bin/nest build
RUN yarn install --prod


FROM node:14-alpine
COPY --from=build /home/node/tfc/node_modules /home/node/tfc/node_modules
COPY --from=build /home/node/tfc/dist /home/node/tfc/dist
#RUN chown  node  /home/node/tfc/dist/stations.sqlite*
RUN chown  node  /home/node/tfc/dist/
WORKDIR /home/node/tfc/dist
USER node

CMD node main.js
