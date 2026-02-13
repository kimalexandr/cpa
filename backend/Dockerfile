# Debian 11 (Bullseye): есть libssl.so.1.1, Prisma в контейнере определяет runtime как debian-openssl-1.1.x
FROM node:20-bullseye-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma/
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

RUN npm prune --production

# Миграции и сид не запускаем автоматически — выполняются вручную или в CI
# docker-compose run app npm run db:migrate
# docker-compose run app npm run db:seed

CMD ["node", "dist/index.js"]
