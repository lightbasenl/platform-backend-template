FROM node:18-alpine as deps

WORKDIR /app

COPY ./vendor ./vendor
COPY package.json yarn.lock ./

RUN yarn --production=false

COPY . .
RUN yarn compas generate application --skip-lint

RUN yarn --production=true

FROM node:18-alpine

WORKDIR /app

COPY --from=deps /app/vendor ./vendor
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated/application ./src/generated/application
COPY . .
