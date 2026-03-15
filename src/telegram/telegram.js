// src/telegram/telegram.js — хелперы для Telegram Bot API

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const API = `https://api.telegram.org/bot${TOKEN}`

export async function sendTelegramMessage(chatId, text, extra = {}) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...extra
  }
  const res = await fetch(`${API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json()
}

export async function editTelegramMessage(chatId, messageId, text, extra = {}) {
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    ...extra
  }
  const res = await fetch(`${API}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json()
}

export function mdToHtml(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => `<pre>${c.trim()}</pre>`)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/gs, '<b>$1</b>')
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    .replace(/_([^_\n]+)_/g, '<i>$1</i>')
}

// Главное меню — InlineKeyboard с проектами
export function buildMainMenu(lists) {
  const activeLists = lists.filter(l => !l.is_done)
  
  // Разбиваем на ряды по 2 кнопки
  const rows = []
  for (let i = 0; i < activeLists.length; i += 2) {
    const row = []
    row.push({ text: `📋 ${activeLists[i].name}`, callback_data: `list:${activeLists[i].list_id}` })
    if (activeLists[i + 1]) {
      row.push({ text: `📋 ${activeLists[i + 1].name}`, callback_data: `list:${activeLists[i + 1].list_id}` })
    }
    rows.push(row)
  }
  
  // Нижняя строка — системные кнопки
  rows.push([
    { text: '🔗 Открыть Web App', web_app: { url: process.env.MINI_APP_URL || '' } },
    { text: '🔄 Обновить', callback_data: 'refresh_lists' }
  ])

  return { inline_keyboard: rows }
}

// Меню для конкретной колоды
export function buildListMenu(listId, listName) {
  return {
    inline_keyboard: [
      [{ text: `← Назад к проектам`, callback_data: 'menu' }]
    ]
  }
}

// Постоянная клавиатура внизу чата
export function buildPersistentKeyboard() {
  return {
    keyboard: [[
      { text: '🌐 Web App' },
      { text: '🔄 Обновить' }
    ]],
    resize_keyboard: true,
    persistent: true
  }
}
