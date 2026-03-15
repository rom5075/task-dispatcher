// server.js — Express сервер + API для Web App

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { webhookHandler } from './bot/webhook.js'
import { startPolling } from './src/polling/trelloPolling.js'
import {
  validateAccessToken, checkRateLimit, recordAuthAttempt,
  beginPasskeyRegistration, finishPasskeyRegistration,
  beginPasskeyAuth, finishPasskeyAuth
} from './src/auth/auth.js'
import {
  getTrelloLists, getTasksByList, getAllActiveTasks
} from './src/db/sqlite.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: process.env.APP_URL || '*' }))
app.use(express.json())

// ─── Telegram Webhook ─────────────────────────────────────────────────────────

app.post('/api/webhook', (req, res) => {
  res.sendStatus(200) // КРИТИЧНО: отвечаем сразу
  webhookHandler(new Request('http://localhost/api/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req.body)
  })).catch(err => console.error('[webhook] error:', err))
})

// ─── Auth Middleware ───────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'] || req.query.token
  if (!token) return res.status(401).json({ error: 'Токен не передан' })
  
  const profile = validateAccessToken(token)
  if (!profile) return res.status(401).json({ error: 'Токен недействителен' })
  
  req.userId = profile.user_id
  req.profile = profile
  next()
}

// ─── API: Tasks ───────────────────────────────────────────────────────────────

app.get('/api/lists', requireAuth, (req, res) => {
  const lists = getTrelloLists()
  res.json(lists)
})

app.get('/api/tasks', requireAuth, (req, res) => {
  const { listId } = req.query
  const tasks = listId ? getTasksByList(listId) : getAllActiveTasks()
  res.json(tasks)
})

// ─── Auth: Passkey Registration ───────────────────────────────────────────────

app.post('/api/auth/passkey/register/begin', requireAuth, async (req, res) => {
  try {
    const options = await beginPasskeyRegistration(req.userId, req.profile.telegram_name)
    res.json(options)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/auth/passkey/register/finish', requireAuth, async (req, res) => {
  try {
    await finishPasskeyRegistration(req.userId, req.body)
    res.json({ success: true })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// ─── Auth: Passkey Authentication ─────────────────────────────────────────────

app.post('/api/auth/passkey/auth/begin', async (req, res) => {
  const ip = req.ip

  // Rate limiting
  const limit = checkRateLimit(ip)
  if (limit.blocked) return res.status(429).json({ error: limit.reason })
  recordAuthAttempt(ip)

  try {
    const ADMIN_ID = process.env.ADMIN_ID
    const options = await beginPasskeyAuth(ADMIN_ID)
    res.json(options)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

app.post('/api/auth/passkey/auth/finish', async (req, res) => {
  try {
    const ADMIN_ID = process.env.ADMIN_ID
    await finishPasskeyAuth(ADMIN_ID, req.body)
    
    // Возвращаем токен сессии
    const { createAccessTokenForUser } = await import('./src/auth/auth.js')
    const token = createAccessTokenForUser(ADMIN_ID)
    res.json({ success: true, token })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// ─── Auth: Token Validation ───────────────────────────────────────────────────

app.get('/api/auth/validate', requireAuth, (req, res) => {
  res.json({ valid: true, userId: req.userId })
})

// ─── Статика Web App ──────────────────────────────────────────────────────────

// В продакшене Express отдаёт собранный React
app.use(express.static(path.join(__dirname, 'web/dist')))
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' })
  res.sendFile(path.join(__dirname, 'web/dist/index.html'))
})

// ─── Запуск ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[server] Запущен на порту ${PORT}`)
  startPolling()
})
