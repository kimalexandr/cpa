# Debian-based образ: в Alpine нет libssl.so.1.1, нужной для Prisma
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma/
# Только OpenSSL 3 — иначе в образ попадает и 1.1.x, Prisma может выбрать его
RUN sed -i 's/binaryTargets = \["native", "debian-openssl-3.0.x"\]/binaryTargets = ["debian-openssl-3.0.x"]/' prisma/schema.prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

RUN npm prune --production

# Миграции и сид не запускаем автоматически — выполняются вручную или в CI
# docker-compose run app npm run db:migrate
# docker-compose run app npm run db:seed

CMD ["node", "dist/index.js"]
