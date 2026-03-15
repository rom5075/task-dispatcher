import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DB_PATH || './data/tasks.db'

// Создаём директорию если нет
const dir = path.dirname(DB_PATH)
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// ─── Миграции ────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    user_id       TEXT PRIMARY KEY,
    telegram_name TEXT,
    access_token  TEXT UNIQUE,           -- долгоживущий токен для web app
    token_created_at TEXT,
    passkey_challenge TEXT,              -- временный challenge для WebAuthn
    passkey_credential TEXT,            -- JSON: сохранённый passkey
    created_at    TEXT DEFAULT (datetime('now')),
    last_seen     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    trello_card_id TEXT UNIQUE,          -- ID карточки в Trello
    trello_list_id TEXT,                 -- ID колоды в Trello
    list_name     TEXT,                  -- название колоды (кэш)
    title         TEXT NOT NULL,
    description   TEXT,
    status        TEXT DEFAULT 'active', -- active | done
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS trello_lists (
    list_id   TEXT PRIMARY KEY,          -- Trello list ID
    name      TEXT NOT NULL,             -- название колоды
    position  REAL,
    is_done   INTEGER DEFAULT 0,         -- 1 если это колода "Выполненные"
    synced_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS auth_attempts (
    ip        TEXT NOT NULL,
    attempted_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_list ON tasks(trello_list_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_auth_ip ON auth_attempts(ip, attempted_at);
`)

// Миграция: добавляем due_date если ещё нет (для существующих БД)
try { db.exec(`ALTER TABLE tasks ADD COLUMN due_date TEXT`) } catch { /* уже есть */ }

// ─── Profiles ─────────────────────────────────────────────────────────────────

export function upsertProfile(userId, telegramName) {
  db.prepare(`
    INSERT INTO profiles (user_id, telegram_name, last_seen)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      telegram_name = excluded.telegram_name,
      last_seen = datetime('now')
  `).run(String(userId), telegramName || '')
}

export function getProfile(userId) {
  return db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(String(userId))
}

// ─── Access Tokens ─────────────────────────────────────────────────────────────

export function saveAccessToken(userId, token) {
  db.prepare(`
    UPDATE profiles SET access_token = ?, token_created_at = datetime('now')
    WHERE user_id = ?
  `).run(token, String(userId))
}

export function getProfileByToken(token) {
  return db.prepare('SELECT * FROM profiles WHERE access_token = ?').get(token)
}

// ─── Passkey ──────────────────────────────────────────────────────────────────

export function savePasskeyChallenge(userId, challenge) {
  db.prepare('UPDATE profiles SET passkey_challenge = ? WHERE user_id = ?')
    .run(challenge, String(userId))
}

export function savePasskeyCredential(userId, credentialJSON) {
  db.prepare('UPDATE profiles SET passkey_credential = ?, passkey_challenge = NULL WHERE user_id = ?')
    .run(JSON.stringify(credentialJSON), String(userId))
}

export function getPasskeyCredential(userId) {
  const row = db.prepare('SELECT passkey_credential, passkey_challenge FROM profiles WHERE user_id = ?').get(String(userId))
  if (!row) return null
  return {
    credential: row.passkey_credential ? JSON.parse(row.passkey_credential) : null,
    challenge: row.passkey_challenge
  }
}

// ─── Trello Lists (кэш колод) ──────────────────────────────────────────────────

export function upsertTrelloLists(lists) {
  const stmt = db.prepare(`
    INSERT INTO trello_lists (list_id, name, position, is_done, synced_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(list_id) DO UPDATE SET
      name = excluded.name,
      position = excluded.position,
      synced_at = datetime('now')
  `)
  const insert = db.transaction((lists) => {
    for (const l of lists) {
      const isDone = /выполнен|done|complete|завершён/i.test(l.name) ? 1 : 0
      stmt.run(l.id, l.name, l.pos, isDone)
    }
  })
  insert(lists)
}

export function getTrelloLists() {
  return db.prepare('SELECT * FROM trello_lists ORDER BY position').all()
}

export function getTrelloListByName(name) {
  return db.prepare('SELECT * FROM trello_lists WHERE name LIKE ?').get(`%${name}%`)
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export function upsertTask(task) {
  db.prepare(`
    INSERT INTO tasks (trello_card_id, trello_list_id, list_name, title, description, status, due_date, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(trello_card_id) DO UPDATE SET
      trello_list_id = excluded.trello_list_id,
      list_name = excluded.list_name,
      title = excluded.title,
      description = excluded.description,
      status = excluded.status,
      due_date = excluded.due_date,
      updated_at = datetime('now')
  `).run(
    task.trello_card_id,
    task.trello_list_id,
    task.list_name,
    task.title,
    task.description || '',
    task.status || 'active',
    task.due_date || null
  )
}

export function getTasksByList(listId) {
  return db.prepare(`
    SELECT * FROM tasks WHERE trello_list_id = ? AND status = 'active'
    ORDER BY created_at DESC
  `).all(listId)
}

export function getAllActiveTasks() {
  return db.prepare(`
    SELECT t.*, l.name as list_name FROM tasks t
    LEFT JOIN trello_lists l ON t.trello_list_id = l.list_id
    WHERE t.status = 'active' ORDER BY t.created_at DESC
  `).all()
}

export function searchTasks(query) {
  // Разбиваем на слова и обрезаем окончания для морфологии (>5 букв → -3, >3 → -2)
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const patterns = words.map(w => {
    const stem = w.length > 5 ? w.slice(0, -3) : w.length > 3 ? w.slice(0, -2) : w
    return `%${stem}%`
  })
  const conditions = patterns.map(() =>
    '(LOWER(t.title) LIKE ? OR LOWER(t.description) LIKE ?)'
  ).join(' AND ')
  const params = patterns.flatMap(p => [p, p])

  return db.prepare(`
    SELECT t.*, tl.name as list_name FROM tasks t
    LEFT JOIN trello_lists tl ON t.trello_list_id = tl.list_id
    WHERE t.status = 'active' AND ${conditions}
    ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC
    LIMIT 20
  `).all(...params)
}

export function markTaskDone(trelloCardId) {
  db.prepare(`
    UPDATE tasks SET status = 'done', updated_at = datetime('now')
    WHERE trello_card_id = ?
  `).run(trelloCardId)
}

// ─── Auth Rate Limiting ───────────────────────────────────────────────────────

export function recordAuthAttempt(ip) {
  db.prepare('INSERT INTO auth_attempts (ip) VALUES (?)').run(ip)
}

export function getRecentAuthAttempts(ip, windowMinutes = 15) {
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM auth_attempts
    WHERE ip = ? AND attempted_at > datetime('now', '-${windowMinutes} minutes')
  `).get(ip)
  return row.count
}

export function getDailyAuthAttempts(ip) {
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM auth_attempts
    WHERE ip = ? AND attempted_at > datetime('now', '-1 day')
  `).get(ip)
  return row.count
}

export default db
