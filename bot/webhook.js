// bot/webhook.js — главный файл бота

import { parseTasks } from '../src/ai/taskParser.js'
import { createCard } from '../src/trello/trello.js'
import {
  upsertProfile, getTrelloLists, upsertTask, getTasksByList, searchTasks
} from '../src/db/sqlite.js'
import {
  sendTelegramMessage, editTelegramMessage,
  buildMainMenu, buildListMenu, buildPersistentKeyboard
} from '../src/telegram/telegram.js'
import { forceSyncLists } from '../src/polling/trelloPolling.js'
import { createAccessTokenForUser } from '../src/auth/auth.js'

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const ADMIN_ID = process.env.ADMIN_ID
const APP_URL = process.env.APP_URL || ''

// ─── Главный обработчик ───────────────────────────────────────────────────────

export async function webhookHandler(req) {
  let body
  try {
    body = await req.json()
  } catch {
    return new Response('ok', { status: 200 })
  }

  // Обрабатываем callback_query (нажатие кнопок)
  if (body.callback_query) {
    await handleCallback(body.callback_query)
    return new Response('ok', { status: 200 })
  }

  const msg = body.message
  if (!msg || !msg.text) return new Response('ok', { status: 200 })

  const chatId  = msg.chat.id
  const userId  = msg.from.id
  const text    = msg.text.trim()
  const name    = msg.from.first_name || 'User'

  // Только для владельца
  if (String(userId) !== String(ADMIN_ID)) {
    await sendTelegramMessage(chatId, '⛔ Это личный бот.')
    return new Response('ok', { status: 200 })
  }

  upsertProfile(userId, name)

  // ─── Команды ──────────────────────────────────────────────────────────────

  if (text === '/start') {
    const lists = getTrelloLists()
    await sendTelegramMessage(chatId,
      `👋 <b>Task Dispatcher</b>\n\nПиши задачи свободным текстом — я распределю их по Trello.\n\nПроектов загружено: ${lists.filter(l => !l.is_done).length}`,
      { reply_markup: buildPersistentKeyboard() }
    )
    await sendTelegramMessage(chatId, '📋 <b>Проекты:</b>', { reply_markup: buildMainMenu(lists) })
    return new Response('ok', { status: 200 })
  }

  if (text === '/menu') {
    const lists = getTrelloLists()
    await sendTelegramMessage(chatId, '📋 <b>Проекты:</b>', { reply_markup: buildMainMenu(lists) })
    return new Response('ok', { status: 200 })
  }

  if (text === '/sync') {
    const processing = await sendTelegramMessage(chatId, '🔄 Синхронизирую колоды с Trello...')
    const lists = await forceSyncLists()
    await editTelegramMessage(chatId, processing.result.message_id,
      `✅ Синхронизировано ${lists.length} колод:\n` +
      lists.map(l => `• ${l.name}${l.is_done ? ' (выполненные)' : ''}`).join('\n'),
      { reply_markup: buildMainMenu(lists) }
    )
    return new Response('ok', { status: 200 })
  }

  if (text === '/webapp' || text === '🌐 Web App') {
    const token = createAccessTokenForUser(userId)
    const url = `${APP_URL}?token=${token}`
    await sendTelegramMessage(chatId,
      `🔗 <b>Ссылка на Web App:</b>\n\n<code>${url}</code>\n\n⚠️ Сохрани эту ссылку в закладки — она работает без Telegram.\nДействительна 1 год.`,
      {
        reply_markup: {
          inline_keyboard: [[
            { text: '🌐 Открыть Web App', url }
          ]]
        }
      }
    )
    return new Response('ok', { status: 200 })
  }

  if (text.startsWith('/search ') || text.startsWith('🔍 ')) {
    const query = text.replace(/^\/search |^🔍 /, '').trim()
    if (!query) {
      await sendTelegramMessage(chatId, '🔍 Укажи запрос: <code>/search текст</code>')
      return new Response('ok', { status: 200 })
    }
    const results = searchTasks(query)
    if (results.length === 0) {
      await sendTelegramMessage(chatId, `🔍 По запросу "<b>${query}</b>" ничего не найдено.`)
      return new Response('ok', { status: 200 })
    }
    const lines = results.map(t => {
      const due = t.due_date ? ` 📅 ${t.due_date}` : ''
      const list = t.list_name ? ` <i>${t.list_name}</i>` : ''
      return `• ${t.title}${due}${list}`
    })
    await sendTelegramMessage(chatId,
      `🔍 <b>${results.length} результатов по "${query}":</b>\n\n${lines.join('\n')}`
    )
    return new Response('ok', { status: 200 })
  }

  if (text === '🔄 Обновить') {
    const processing = await sendTelegramMessage(chatId, '🔄 Синхронизирую колоды с Trello...')
    const lists = await forceSyncLists()
    await editTelegramMessage(chatId, processing.result.message_id,
      `✅ Синхронизировано ${lists.length} колод:\n` +
      lists.map(l => `• ${l.name}${l.is_done ? ' (выполненные)' : ''}`).join('\n'),
      { reply_markup: buildMainMenu(lists) }
    )
    return new Response('ok', { status: 200 })
  }

  // ─── Парсинг задач из текста ───────────────────────────────────────────────

  const lists = getTrelloLists()
  if (lists.length === 0) {
    await sendTelegramMessage(chatId,
      '⚠️ Колоды Trello не загружены. Отправь /sync для синхронизации.'
    )
    return new Response('ok', { status: 200 })
  }

  // Показываем плейсхолдер
  const placeholder = await sendTelegramMessage(chatId, '⏳ Анализирую задачи...')
  const placeholderMsgId = placeholder.result?.message_id

  try {
    // AI парсит задачи
    const tasks = await parseTasks(text, lists)

    if (!tasks || tasks.length === 0) {
      await editTelegramMessage(chatId, placeholderMsgId,
        '🤔 Не нашёл задач в сообщении. Попробуй написать конкретнее.',
        { reply_markup: buildMainMenu(lists) }
      )
      return new Response('ok', { status: 200 })
    }

    // Создаём карточки в Trello
    const created = []
    for (const task of tasks) {
      const card = await createCard({
        listId: task.listId,
        title: task.title,
        description: task.description,
        due: task.due || null
      })

      upsertTask({
        trello_card_id: card.id,
        trello_list_id: task.listId,
        list_name: task.listName,
        title: task.title,
        description: task.description,
        status: 'active',
        due_date: task.due || null
      })

      created.push({ ...task, cardUrl: card.shortUrl })
    }

    // Формируем отчёт
    const report = formatTaskReport(created)
    await editTelegramMessage(chatId, placeholderMsgId, report, {
      reply_markup: buildMainMenu(lists),
      disable_web_page_preview: true
    })

  } catch (err) {
    console.error('[webhook] Ошибка создания задач:', err)
    await editTelegramMessage(chatId, placeholderMsgId,
      `❌ Ошибка: ${err.message}`,
      { reply_markup: buildMainMenu(lists) }
    )
  }

  return new Response('ok', { status: 200 })
}

// ─── Callback обработчик (кнопки) ─────────────────────────────────────────────

async function handleCallback(cb) {
  const chatId = cb.message.chat.id
  const msgId  = cb.message.message_id
  const data   = cb.data

  // Убираем "часики" с кнопки
  await fetch(`https://api.telegram.org/bot${TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: cb.id })
  })

  if (data === 'menu') {
    const lists = getTrelloLists()
    await editTelegramMessage(chatId, msgId, '📋 <b>Проекты:</b>', {
      reply_markup: buildMainMenu(lists)
    })
    return
  }

  if (data === 'refresh_lists') {
    const lists = await forceSyncLists()
    await editTelegramMessage(chatId, msgId,
      `✅ Обновлено: ${lists.length} колод`,
      { reply_markup: buildMainMenu(lists) }
    )
    return
  }

  if (data.startsWith('list:')) {
    const listId = data.replace('list:', '')
    const tasks = getTasksByList(listId)
    const lists = getTrelloLists()
    const list  = lists.find(l => l.list_id === listId)
    
    let text = `📋 <b>${list?.name || 'Проект'}</b>\n\n`
    
    if (tasks.length === 0) {
      text += '✨ Задач нет — всё чисто!'
    } else {
      text += tasks.map((t, i) => `${i + 1}. ${t.title}`).join('\n')
    }

    await editTelegramMessage(chatId, msgId, text, {
      reply_markup: buildListMenu(listId, list?.name)
    })
    return
  }
}

// ─── Форматирование отчёта ────────────────────────────────────────────────────

function formatTaskReport(tasks) {
  const lines = tasks.map(t => {
    const emoji = getListEmoji(t.listName)
    const due = t.due ? ` 📅 ${t.due}` : ''
    return `${emoji} <b>${t.listName}</b> → <a href="${t.cardUrl}">${t.title}</a>${due}`
  })

  return `✅ <b>Создано ${tasks.length} ${plural(tasks.length, 'задача', 'задачи', 'задач')}:</b>\n\n` +
         lines.join('\n')
}

function getListEmoji(listName = '') {
  const name = listName.toLowerCase()
  if (/личн|home|personal/.test(name)) return '🏠'
  if (/вход|inbox/.test(name)) return '📥'
  return '📋'
}

function plural(n, one, few, many) {
  if (n % 10 === 1 && n % 100 !== 11) return one
  if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return few
  return many
}
