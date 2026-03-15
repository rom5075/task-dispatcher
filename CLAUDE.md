# Task Dispatcher — контекст для Claude Code

Персональный бот-менеджер задач. Пользователь пишет свободный текст →
Claude Haiku парсит задачи → карточки создаются в Trello → отчёт в Telegram.
Дополнительно: React Web App с доступом по токену/passkey (работает без Telegram).

---

## Стек

| Слой | Технология |
|---|---|
| Runtime | Node.js 22 LTS (**не 24** — `better-sqlite3` не компилируется) |
| Backend | Express (`server.js`) |
| БД | SQLite через `better-sqlite3` (синхронный API) |
| AI | Anthropic API — `claude-haiku-4-5-20251001` (парсинг задач) |
| Telegram | Bot API через прямые `fetch` (без библиотек) |
| Trello | REST API v1 (`https://api.trello.com/1`) |
| Frontend | React 18 + Vite (в папке `web/`) |
| Auth | Access token (96 hex chars) + WebAuthn Passkey (`@simplewebauthn`) |
| Polling | `node-cron` — Trello каждые N минут |
| Деплой | GitHub Actions → VPS → pm2 |

---

## Структура проекта

```
task-dispatcher/
├── server.js                      ← Express: webhook + REST API + статика web/dist
├── package.json
├── .env.example
│
├── bot/
│   └── webhook.js                 ← ВСЯ логика бота (команды, кнопки, парсинг)
│
├── src/
│   ├── db/sqlite.js               ← Все функции БД (upsert/get/*)
│   ├── ai/taskParser.js           ← Claude парсит текст → [{title, listId, ...}]
│   ├── trello/trello.js           ← Trello API: getBoardLists, createCard, moveCard
│   ├── telegram/telegram.js       ← sendMessage, editMessage, buildMainMenu, buildListMenu
│   ├── polling/trelloPolling.js   ← startPolling(), forceSyncLists()
│   └── auth/auth.js               ← токены + WebAuthn регистрация/авторизация
│
└── web/                           ← React Web App (Vite)
    ├── index.html
    ├── vite.config.js             ← proxy /api → localhost:3001
    └── src/
        ├── main.jsx
        ├── App.jsx                ← роутинг по статусу auth
        ├── hooks/useAuth.js       ← токен из URL → localStorage → Telegram → Passkey
        └── pages/
            ├── LoginScreen.jsx    ← экран входа (кнопка Passkey)
            └── TaskBoard.jsx      ← табы по колодам + список задач
```

---

## Переменные окружения (.env)

```env
TELEGRAM_BOT_TOKEN=       # @BotFather
ADMIN_ID=                 # единственный пользователь бота (Telegram user_id)
MINI_APP_URL=             # https://домен — URL веб-приложения для кнопки в боте

ANTHROPIC_API_KEY=        # console.anthropic.com

TRELLO_API_KEY=           # trello.com/app-key
TRELLO_TOKEN=             # там же → "Token"
TRELLO_BOARD_ID=          # ID доски из URL: trello.com/b/BOARD_ID/...

DB_PATH=./data/tasks.db
PORT=3001
APP_URL=                  # https://домен (для WebAuthn origin)

JWT_SECRET=               # openssl rand -hex 32
PASSKEY_RP_NAME=Task Dispatcher
PASSKEY_RP_ID=            # домен без https (myapp.duckdns.org)

TRELLO_POLL_INTERVAL=5    # минуты между синхронизациями
```

---

## Ключевые паттерны

### 1. Webhook — 200 сразу (критично!)
```js
// server.js
app.post('/api/webhook', (req, res) => {
  res.sendStatus(200)  // Telegram не будет ретраить → нет дублей
  webhookHandler(...).catch(err => console.error(err))
})
```

### 2. Telegram: только HTML, не Markdown
Markdown v1 ломается на emoji и кириллице.
Всегда `parse_mode: 'HTML'`. Конвертер `mdToHtml()` в `src/telegram/telegram.js`.

### 3. editMessageText — только InlineKeyboard
`ReplyKeyboardMarkup` в `editMessageText` не работает.
Только `InlineKeyboardMarkup`. Все кнопки — inline.

### 4. Кнопки в боте
- Главное меню: `buildMainMenu(lists)` — по кнопке на каждую колоду + кнопка Web App
- Меню колоды: `buildListMenu(listId, name)` — кнопка "назад"
- callback_data формат: `list:<list_id>`, `menu`, `refresh_lists`
- Показывать после **каждого** ответа бота

### 5. AI парсинг задач
`src/ai/taskParser.js` — claude-haiku получает текст + список колод,
возвращает строго JSON `{ tasks: [{title, description, listId, listName}] }`.
Логика определения проекта:
- Явно личное (быт, покупки, семья) → колода "Личное"
- Проект понятен из текста → нужная колода
- Рабочее, проект неясен → колода "Входящие"

### 6. Синхронизация Trello
- При старте сервера — немедленная синхронизация колод и карточек
- Потом `node-cron` каждые `TRELLO_POLL_INTERVAL` минут
- При изменении колоды карточки → уведомление ADMIN_ID в Telegram
- Колода считается "выполненные" если name матчит `/выполнен|done|complete|завершён/i`

### 7. Авторизация Web App (приоритет проверки)
1. `?token=` в URL → сохранить в localStorage, убрать из URL
2. `window.Telegram.WebApp.initData` → обменять на токен
3. токен из `localStorage`
4. Passkey (Face ID / Touch ID) через `@simplewebauthn/browser`

### 8. Access Token
- 96 hex символов (`crypto.randomBytes(48)`)
- Хранится в `profiles.access_token`
- Генерируется командой `/webapp` в боте
- Используется как `x-auth-token` header в API запросах

---

## SQLite схема

```sql
profiles       — user_id, telegram_name, access_token, passkey_challenge, passkey_credential
tasks          — trello_card_id (UNIQUE), trello_list_id, list_name, title, description, status
trello_lists   — list_id (PK), name, position, is_done (авто-определяется по названию)
auth_attempts  — ip, attempted_at (rate limiting для passkey входа)
```

---

## Команды бота

| Что | Действие |
|---|---|
| `/start` | Приветствие + главное меню с проектами |
| `/menu` | Показать главное меню |
| `/sync` | Принудительная синхронизация колод из Trello |
| `/webapp` | Сгенерировать долгоживущий токен + ссылку на Web App |
| любой текст | AI парсит задачи → создаёт карточки в Trello → отчёт |

---

## REST API (для Web App)

```
GET  /api/lists              → список активных колод (не is_done)
GET  /api/tasks?listId=xxx   → задачи колоды (или все если без параметра)
GET  /api/auth/validate      → проверка токена

POST /api/auth/passkey/register/begin   → начать регистрацию passkey (requireAuth)
POST /api/auth/passkey/register/finish  → завершить регистрацию passkey (requireAuth)
POST /api/auth/passkey/auth/begin       → начать вход по passkey
POST /api/auth/passkey/auth/finish      → завершить вход, получить токен
```

Аутентификация: заголовок `x-auth-token: <token>` или query `?token=<token>`

---

## Rate Limiting (auth)

- 3 попытки за 15 минут → блокировка IP на 15 минут
- 10 попыток за сутки → блокировка IP на 24 часа
- Реализовано в `src/auth/auth.js` через таблицу `auth_attempts`

---

## Деплой

### VPS (основной способ)
```bash
git clone <repo> && cd task-dispatcher
npm install
cd web && npm install && npm run build && cd ..
cp .env.example .env && nano .env
pm2 start server.js --name task-dispatcher
pm2 save && pm2 startup
```

### nginx
```nginx
server {
    listen 443 ssl;
    server_name myapp.duckdns.org;
    ssl_certificate /etc/letsencrypt/live/myapp.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/myapp.duckdns.org/privkey.pem;
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

### Установить Telegram webhook
```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://myapp.duckdns.org/api/webhook"
```

### GitHub Actions
```yaml
- name: Deploy
  uses: appleboy/ssh-action@v1
  with:
    script: |
      cd /var/www/task-dispatcher
      git pull
      npm install --production
      cd web && npm run build && cd ..
      pm2 restart task-dispatcher
```

### Команды pm2
```bash
pm2 logs task-dispatcher --lines 50
pm2 restart task-dispatcher
pm2 show task-dispatcher
```

---

## Частые ошибки

| Ошибка | Причина | Решение |
|---|---|---|
| Дубли сообщений | не отдаём 200 сразу | `res.sendStatus(200)` до `webhookHandler` |
| ReplyKeyboard в edit | не поддерживается | использовать только InlineKeyboard |
| Node 24 | better-sqlite3 не компилируется | Node 22 LTS |
| Markdown ломается | emoji/кириллица | parse_mode: 'HTML' |
| Passkey не работает | неверный RP_ID или ORIGIN | RP_ID = домен без https, APP_URL = с https |
| Колоды не определяются | TRELLO_BOARD_ID неверный | взять из URL доски trello.com/b/**BOARD_ID** |
| Web App не открывается | MINI_APP_URL не задан | задать после деплоя |

---

## Что ещё не реализовано (TODO)

- [ ] `POST /api/auth/telegram` — вход через `initData` из Telegram Web App
- [ ] Passkey регистрация из Web App (сейчас только через бота)
- [ ] Страница настроек в Web App (зарегистрировать Passkey, обновить ссылку)
- [ ] Создание задачи прямо из Web App (форма + AI парсинг)
- [ ] Отметить задачу выполненной из Web App (moveCard → done list)
- [ ] Дедлайны на карточках Trello (due date)
- [ ] Поиск по задачам в боте
