# Debian 11 (Bullseye): есть libssl.so.1.1, Prisma в контейнере определяет runtime как debian-openssl-1.1.x
FROM node:20-bullseye-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma/
RUN npx prisma generate

COPY tsconfig.json tsconfig.seed.json ./
COPY src ./src
RUN npm run build

# Не удаляем devDependencies: для db:seed в CI нужны prisma и ts-node
# RUN npm prune --production

# Миграции и сид выполняются в деплое (см. .github/workflows/deploy.yml)
# docker-compose run app npm run db:migrate
# docker-compose run app npm run db:seed

CMD ["node", "dist/index.js"]
