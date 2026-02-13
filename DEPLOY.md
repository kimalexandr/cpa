# Развёртывание на VPS

Краткая инструкция для деплоя Partnerkin (бэкенд + фронт) на сервер с Docker.

## Требования

- VPS с Ubuntu 22.04 (или аналог)
- Docker и Docker Compose
- Домен (опционально, для HTTPS)

## 1. Установка Docker на VPS

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# выйти и зайти снова в SSH
```

## 2. Клонирование и настройка

```bash
git clone https://github.com/kimalexandr/cpa.git
cd cpa/backend
cp .env.example .env
nano .env   # задать JWT_SECRET, при необходимости DATABASE_URL
```

В `.env` обязательно сменить:
- `JWT_SECRET` — длинная случайная строка для продакшена.

## 3. Запуск бэкенда (БД + API)

```bash
cd backend
docker-compose up -d --build
docker-compose run --rm app npm run db:migrate
docker-compose run --rm app npm run db:seed   # при необходимости — тестовые данные
```

API будет доступен на порту **3000**.

## 4. Раздача фронтенда

Статика лежит в корне репозитория (`index.html`, `login.html`, `api.js` и т.д.). Варианты:

**Вариант A — Nginx (рекомендуется)**

```bash
sudo apt install nginx -y
```

Конфиг сайта (например `/etc/nginx/sites-available/cpa`):

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/cpa;           # путь к клону репо, папка cpa (корень с index.html)
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/cpa /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**Вариант B — только API на VPS, фронт открывать с локальной машины или другого хостинга**  
На VPS поднимаете только `backend` (шаг 3). Во фронте в `api.js` или в настройках указываете `window.REALCPA_API_URL = 'https://api.your-domain.com'`.

## 5. HTTPS (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

## Полезные команды

| Действие | Команда |
|----------|--------|
| Логи бэкенда | `docker-compose -f backend/docker-compose.yml logs -f app` |
| Остановить | `docker-compose -f backend/docker-compose.yml down` |
| Обновление с Git | `git pull` в папке репо, затем в `backend`: `docker-compose up -d --build` |

После деплоя во фронте укажите актуальный URL API (переменная `REALCPA_API_URL` или правки в `api.js`), чтобы запросы шли на ваш VPS.

---

## Автопубликация с GitHub (CI/CD)

При пуше в ветку `main` проект автоматически обновляется на VPS (workflow `.github/workflows/deploy.yml`).

### 1. SSH-ключ для GitHub Actions

На **вашем компьютере** (не на VPS) создайте отдельный ключ для деплоя:

```bash
ssh-keygen -t ed25519 -C "github-deploy" -f deploy_key -N ""
```

Появятся файлы `deploy_key` (приватный) и `deploy_key.pub` (публичный).

### 2. Публичный ключ на VPS

Подключитесь к VPS и добавьте публичный ключ:

```bash
# На вашем компьютере скопировать содержимое deploy_key.pub
cat deploy_key.pub

# На VPS (под root):
mkdir -p ~/.ssh
echo "ВСТАВЬТЕ_СОДЕРЖИМОЕ_deploy_key.pub" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### 3. Секреты в GitHub

Репозиторий → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Добавьте:

| Имя | Значение |
|-----|----------|
| `VPS_HOST` | IP или домен сервера, например `155.212.221.220` |
| `VPS_USER` | Пользователь SSH, например `root` |
| `VPS_SSH_KEY` | Полное содержимое файла **deploy_key** (приватный ключ, включая строки `-----BEGIN ... -----`) |

### 4. Первый деплой вручную

На VPS репозиторий должен уже быть клонирован в `/root/cpa` (см. шаги 2–3 выше). После добавления секретов при следующем `git push origin main` запустится деплой. Или запустите его вручную: **Actions** → **Deploy to VPS** → **Run workflow**.

При деплое на VPS выполняется: `git pull`, затем в `backend` — `docker-compose up -d --build` и миграции.
