FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.js validate.js schema.sql schema-postgis.sql ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "index.js"]
