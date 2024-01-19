FROM node:18-alpine as deps

WORKDIR /app

COPY ./vendor ./vendor
COPY package.json package-lock.json ./

RUN npm install

COPY . .
RUN npx compas generate application --skip-lint

RUN npm install --omit=dev

FROM node:18-alpine

WORKDIR /app

COPY --from=deps /app/vendor ./vendor
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated/application ./src/generated/application
COPY . .
