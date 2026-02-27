FROM node:20-slim

WORKDIR /app

COPY package.json ./
COPY build/ ./build/

RUN npm install --omit=dev

ENTRYPOINT ["node", "build/index.js"]
