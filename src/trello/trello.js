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
  return trelloFetch(`/boards/${BOARD_ID}/cards?fields=id,name,desc,idList,closed`)
}

export async function createCard({ listId, title, description = '' }) {
  return trelloFetch(`/cards`, {
    method: 'POST',
    body: JSON.stringify({
      idList: listId,
      name: title,
      desc: description,
      key: KEY,
      token: TOKEN
    })
  })
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
