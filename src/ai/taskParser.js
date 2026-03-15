// src/ai/taskParser.js — Claude парсит свободный текст → задачи

import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * Парсит свободный текст и возвращает массив задач с определёнными проектами
 * @param {string} text — сообщение пользователя
 * @param {Array}  lists — [{list_id, name, is_done}] — колоды из Trello
 * @returns {Array} [{title, description, listId, listName}]
 */
export async function parseTasks(text, lists) {
  // Убираем колоду "Выполненные" из вариантов для новых задач
  const activeLists = lists.filter(l => !l.is_done)
  const listOptions = activeLists.map(l => `- "${l.name}" (id: ${l.list_id})`).join('\n')

  const systemPrompt = `Ты — ассистент для управления задачами. 
Твоя задача: из свободного текста извлечь все задачи и распределить их по проектам.

Доступные проекты (колоды Trello):
${listOptions}

Правила определения проекта:
1. "Личное" — бытовые дела, покупки, здоровье, семья, хобби
2. Если проект явно упомянут в тексте — использовать его
3. Если проект рабочий но непонятен — использовать "Входящие"
4. Если колоды "Входящие" нет в списке — использовать первую рабочую колоду

Отвечай ТОЛЬКО валидным JSON, без markdown, без пояснений:
{
  "tasks": [
    {
      "title": "Краткое название задачи (до 100 символов)",
      "description": "Детали если есть, иначе пустая строка",
      "listId": "id_колоды",
      "listName": "Название колоды"
    }
  ]
}`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: text }]
  })

  const raw = response.content[0].text.trim()
  
  try {
    const parsed = JSON.parse(raw)
    return parsed.tasks || []
  } catch (e) {
    // Если Claude вернул не чистый JSON — пробуем извлечь
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0])
      return parsed.tasks || []
    }
    throw new Error(`AI вернул невалидный JSON: ${raw}`)
  }
}
