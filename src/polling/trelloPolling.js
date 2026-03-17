// src/polling/trelloPolling.js — следит за изменениями в Trello

import cron from 'node-cron'
import { getBoardCards, getBoardLists } from '../trello/trello.js'
import {
  upsertTask, upsertTrelloLists, markTaskDone,
  getTrelloLists, getAllActiveTasks,
  deleteStaleLists, markDeletedTasksDone
} from '../db/sqlite.js'
import { sendTelegramMessage } from '../telegram/telegram.js'

const ADMIN_ID = process.env.ADMIN_ID
const INTERVAL = parseInt(process.env.TRELLO_POLL_INTERVAL || '5')

// Кэш последнего состояния карточек { cardId: listId }
let lastCardState = {}
let isFirstRun = true

export function startPolling() {
  console.log(`[polling] Запуск Trello polling каждые ${INTERVAL} минут`)
  
  // Сразу синхронизируем при старте
  syncTrello().catch(e => console.error('[polling] Ошибка при старте:', e))
  
  // Затем по расписанию
  cron.schedule(`*/${INTERVAL} * * * *`, async () => {
    await syncTrello().catch(e => console.error('[polling] Ошибка:', e))
  })
}

async function syncTrello() {
  // 1. Обновляем список колод
  const lists = await getBoardLists()
  upsertTrelloLists(lists)

  // 2. Получаем все карточки с доски
  const cards = await getBoardCards()
  
  // 3. Определяем донные колоды
  const doneLists = lists.filter(l => /выполнен|done|complete|завершён/i.test(l.name))
  const doneListIds = new Set(doneLists.map(l => l.id))

  if (isFirstRun) {
    // При первом запуске просто сохраняем состояние
    for (const card of cards) {
      if (!card.closed) {
        lastCardState[card.id] = card.idList
        const listName = lists.find(l => l.id === card.idList)?.name || ''
        const isDone = doneListIds.has(card.idList)
        upsertTask({
          trello_card_id: card.id,
          trello_list_id: card.idList,
          list_name: listName,
          title: card.name,
          description: card.desc,
          status: isDone ? 'done' : 'active'
        })
      }
    }
    isFirstRun = false
    console.log(`[polling] Первая синхронизация: ${cards.length} карточек`)
    return
  }

  // 4. Сравниваем с прошлым состоянием — ищем изменения
  const notifications = []

  for (const card of cards) {
    if (card.closed) continue

    const prevListId = lastCardState[card.id]
    const currListId = card.idList
    const listName = lists.find(l => l.id === currListId)?.name || ''
    const isDone = doneListIds.has(currListId)

    // Обновляем в БД
    upsertTask({
      trello_card_id: card.id,
      trello_list_id: currListId,
      list_name: listName,
      title: card.name,
      description: card.desc,
      status: isDone ? 'done' : 'active'
    })

    if (prevListId && prevListId !== currListId) {
      // Карточка переехала в другую колоду
      const fromName = lists.find(l => l.id === prevListId)?.name || prevListId
      
      if (isDone) {
        notifications.push(`✅ <b>${card.name}</b>\nПеремещена в "${listName}"`)
        markTaskDone(card.id)
      } else {
        notifications.push(`🔄 <b>${card.name}</b>\n${fromName} → ${listName}`)
      }
    }

    lastCardState[card.id] = currListId
  }

  // 5. Отправляем уведомления если есть
  if (notifications.length > 0 && ADMIN_ID) {
    const msg = `<b>📋 Обновления из Trello:</b>\n\n` + notifications.join('\n\n')
    await sendTelegramMessage(ADMIN_ID, msg)
  }
}

export async function forceSyncLists() {
  const lists = await getBoardLists()
  upsertTrelloLists(lists)
  deleteStaleLists(lists.map(l => l.id))

  const cards = await getBoardCards()
  const doneLists = lists.filter(l => /выполнен|done|complete|завершён/i.test(l.name))
  const doneListIds = new Set(doneLists.map(l => l.id))

  for (const card of cards) {
    if (card.closed) continue
    const listName = lists.find(l => l.id === card.idList)?.name || ''
    const isDone = doneListIds.has(card.idList)
    upsertTask({
      trello_card_id: card.id,
      trello_list_id: card.idList,
      list_name: listName,
      title: card.name,
      description: card.desc,
      status: isDone ? 'done' : 'active',
      due_date: card.due ? card.due.slice(0, 10) : null
    })
  }

  const activeCardIds = cards.filter(c => !c.closed).map(c => c.id)
  markDeletedTasksDone(activeCardIds)

  return getTrelloLists()
}
