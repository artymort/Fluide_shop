# FLUIDE Atelier

Первый каркас интернет-магазина парфюмерного бренда FLUIDE.

Сайт создан на HTML, CSS и JavaScript без фреймворков. В проект перенесены
фирменные логотипы, шрифты, палитра и часть каталога для демонстрации.

## Структура

- статический интерфейс находится в корне проекта;
- API на Node.js находится в `server/`;
- миграции PostgreSQL находятся в `server/migrations/`;
- секреты хранятся только в `.env` локально или `/etc/fluide/fluide.env` на сервере.

## Локальный запуск

```bash
npm install
cp .env.example .env
npm run migrate
npm start
```

## Публикация

Продакшен-сайт обслуживает Nginx. API работает отдельным systemd-сервисом только
на `127.0.0.1:3000`, а PostgreSQL принимает соединения только с localhost.

## Яндекс ID

Для входа через Яндекс в защищённом файле окружения должны быть заданы:

```dotenv
YANDEX_CLIENT_ID=...
YANDEX_CLIENT_SECRET=...
YANDEX_REDIRECT_URI=https://fluide-atelier.ru/api/auth/yandex/callback
```

Секрет нельзя добавлять в Git. OAuth-поток использует `state` и PKCE, а токены Яндекса не
хранятся в браузере или PostgreSQL.
