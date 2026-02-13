# Debian-based образ: в Alpine нет libssl.so.1.1, нужной для Prisma
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma/
ENV PRISMA_CLI_BINARY_TARGETS=debian-openssl-3.0.x
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

RUN npm prune --production

# Миграции и сид не запускаем автоматически — выполняются вручную или в CI
# docker-compose run app npm run db:migrate
# docker-compose run app npm run db:seed

CMD ["node", "dist/index.js"]
