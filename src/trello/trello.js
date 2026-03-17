// src/trello/trello.js — Trello REST API клиент

const BASE = 'https://api.trello.com/1'
const KEY = process.env.TRELLO_API_KEY
const TOKEN = process.env.TRELLO_TOKEN
const BOARD_ID = process.env.TRELLO_BOARD_ID

function auth(params = {}) {
  return new URLSearchParams({ key: KEY, token: TOKEN, ...params }).toString()
}

async function trelloFetch(path, options = {}) {
  const sep = path.includes('?') ? '&' : '?'
  const url = `${BASE}${path}${sep}${auth()}`
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Trello API error ${res.status}: ${text}`)
  }
  return res.json()
}

// ─── Колоды (lists) ───────────────────────────────────────────────────────────

export async function getBoardLists() {
  return trelloFetch(`/boards/${BOARD_ID}/lists?fields=id,name,pos`)
}

// ─── Карточки (cards) ─────────────────────────────────────────────────────────

export async function getListCards(listId) {
  return trelloFetch(`/lists/${listId}/cards?fields=id,name,desc,idList,closed`)
}

export async function getBoardCards() {
  return trelloFetch(`/boards/${BOARD_ID}/cards?fields=id,name,desc,idList,closed,due`)
}

export async function attachPhotoToCard(cardId, photoUrl) {
  const response = await fetch(photoUrl)
  if (!response.ok) throw new Error('Не удалось скачать фото из Telegram')
  const buffer = await response.arrayBuffer()
  const blob = new Blob([buffer], { type: 'image/jpeg' })
  const form = new FormData()
  form.append('file', blob, 'photo.jpg')
  const res = await fetch(`${BASE}/cards/${cardId}/attachments?key=${KEY}&token=${TOKEN}`, {
    method: 'POST',
    body: form
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Trello attachment error ${res.status}: ${text}`)
  }
  return res.json()
}

export async function createCard({ listId, title, description = '', due = null }) {
  const body = { idList: listId, name: title, desc: description, key: KEY, token: TOKEN }
  if (due) body.due = new Date(due).toISOString()
  return trelloFetch(`/cards`, { method: 'POST', body: JSON.stringify(body) })
}

export async function moveCard(cardId, listId) {
  return trelloFetch(`/cards/${cardId}`, {
    method: 'PUT',
    body: JSON.stringify({ idList: listId, key: KEY, token: TOKEN })
  })
}

export async function archiveCard(cardId) {
  return trelloFetch(`/cards/${cardId}`, {
    method: 'PUT',
    body: JSON.stringify({ closed: true, key: KEY, token: TOKEN })
  })
}
