# Русское караоке — Discord Activity + Bot

Application ID уже установлен по умолчанию:

`1536334841631477772`

## Что уже работает

- Discord Activity на русском языке.
- OAuth2 авторизация пользователя внутри Activity.
- Поиск песен через LRCLIB.
- Приоритет русскоязычных (кириллических) результатов.
- Приоритет треков с синхронным текстом.
- Выбор песни прямо в Activity.
- Предпросмотр первых строк текста.
- Кнопка подключения бота к голосовому каналу пользователя.
- Бот подключается с `selfDeaf: false`, чтобы следующим этапом принимать голос и считать ноты.
- `/health` для проверки Bothost.

## Что пока намеренно НЕ включено

- Проигрывание музыки.
- AudioProvider (источник аудио).
- Pitch detection и итоговый Score.
- Полноэкранный караоке-режим с бегущими строками.

Это следующий этап после проверки Activity + Voice на реальном Discord сервере.

---

## Discord Developer Portal

### 1. OAuth2 → Redirects

Добавить:

`https://127.0.0.1`

### 2. Installation / Установка

Поддерживаемые контексты:

- User Install
- Guild Install

Для Guild Install нужны scopes:

- `bot`
- `applications.commands`

Минимальные разрешения бота:

- View Channels / Просматривать каналы
- Connect / Подключаться
- Speak / Говорить
- Send Messages / Отправлять сообщения (оставляем на будущее)

Privileged Gateway Intents включать не требуется.

### 3. Activities → Settings

Включить `Enable Activities`.

Discord создаст стандартную Entry Point команду `Launch`.

### 4. Activities → URL Mappings

Это делается ПОСЛЕ того, как Bothost выдаст HTTPS-домен.

Добавить mapping:

- Prefix: `/`
- Target: домен Bothost БЕЗ `https://`

Например, если Bothost дал:

`https://my-karaoke.bothost.tech`

то Target:

`my-karaoke.bothost.tech`

---

## Bothost

Загрузить весь проект.

### Переменные окружения

Обязательно:

- `DISCORD_CLIENT_ID=1536334841631477772`
- `DISCORD_CLIENT_SECRET=...`
- `DISCORD_TOKEN=...`

Если Bothost сам добавляет токен как `BOT_TOKEN`, `DISCORD_TOKEN` можно не создавать: код понимает оба имени.

`DISCORD_CLIENT_SECRET` берётся в Discord Developer Portal → OAuth2 → Client Secret.

### Домен

Включить опцию использования домена / веб-сервиса в Bothost.

Приложение слушает:

- host: `0.0.0.0`
- port: `process.env.PORT`

Поэтому вручную фиксировать внешний HTTPS-порт не надо.

### Команда запуска

`npm start`

Она сначала собирает Activity через Vite, затем запускает Express + Discord bot.

---

## Проверка

1. Открыть в браузере:
   `https://ТВОЙ-ДОМЕН/health`
2. Должен вернуться JSON с `"ok": true`.
3. В Discord открыть App Launcher.
4. Запустить Activity.
5. Ввести, например, `Кино`.
6. Выбрать песню.
7. Зайти в голосовой канал.
8. Нажать `Подключить бота`.

Если бот зашёл в тот же voice — первый этап полностью работает.
