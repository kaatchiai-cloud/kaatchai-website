FROM node:22-slim

WORKDIR /app

COPY dist/index.js dist/index.js
COPY package.json package.json

RUN npm install --omit=dev

ENV NODE_ENV=production
ENV PORT=8080

CMD ["node", "dist/index.js"]
