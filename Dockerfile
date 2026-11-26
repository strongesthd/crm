FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache libstdc++ \
  && apk add --no-cache --virtual .build-deps python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev && apk del .build-deps

COPY src ./src
COPY public ./public

RUN mkdir -p /app/data && chown -R node:node /app

USER node
EXPOSE 3000

CMD ["npm", "start"]
