// web/src/pages/ChatScreen.jsx

import { useState, useEffect, useRef } from 'react'

const WELCOME = {
  id: 0,
  from: 'bot',
  text: 'Привет! Пиши задачи свободным текстом — я распределю их по проектам в Trello.'
}

export default function ChatScreen({ token }) {
  const [messages, setMessages] = useState([WELCOME])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { id: Date.now(), from: 'user', text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/tasks/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify({ text })
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Ошибка сервера')

      const { tasks } = data
      let reply
      if (tasks.length === 0) {
        reply = 'Не удалось распознать задачи. Попробуй описать подробнее.'
      } else {
        const lines = tasks.map(t => `📋 ${t.listName} → ${t.title}`)
        reply = `✅ Создано ${tasks.length} ${plural(tasks.length)}:\n\n${lines.join('\n')}`
      }

      setMessages(prev => [...prev, { id: Date.now() + 1, from: 'bot', text: reply }])
    } catch (e) {
      setMessages(prev => [...prev, { id: Date.now() + 1, from: 'bot', text: '❌ ' + e.message }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div style={s.wrap}>
      <div style={s.messages}>
        {messages.map(msg => (
          <div key={msg.id} style={{ ...s.row, ...(msg.from === 'user' ? s.rowUser : {}) }}>
            <div style={{ ...s.bubble, ...(msg.from === 'user' ? s.bubbleUser : s.bubbleBot) }}>
              {msg.text.split('\n').map((line, i) => (
                <span key={i}>{line}{i < msg.text.split('\n').length - 1 && <br />}</span>
              ))}
            </div>
          </div>
        ))}
        {loading && (
          <div style={s.row}>
            <div style={{ ...s.bubble, ...s.bubbleBot }}>
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={s.inputBar}>
        <textarea
          ref={inputRef}
          style={s.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Напиши задачи..."
          rows={1}
          disabled={loading}
        />
        <button style={{ ...s.sendBtn, ...((!input.trim() || loading) ? s.sendDisabled : {}) }} onClick={send} disabled={!input.trim() || loading}>
          ➤
        </button>
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <span style={s.dots}>
      <span style={{ ...s.dot, animationDelay: '0ms' }} />
      <span style={{ ...s.dot, animationDelay: '200ms' }} />
      <span style={{ ...s.dot, animationDelay: '400ms' }} />
    </span>
  )
}

function plural(n) {
  if (n === 1) return 'задача'
  if (n >= 2 && n <= 4) return 'задачи'
  return 'задач'
}

const s = {
  wrap: {
    maxWidth: 480, margin: '0 auto',
    display: 'flex', flexDirection: 'column',
    height: '100vh', background: '#0f0f1a',
    paddingBottom: 60
  },
  messages: {
    flex: 1, overflowY: 'auto',
    padding: '16px 16px 8px',
    display: 'flex', flexDirection: 'column', gap: 8
  },
  row: { display: 'flex', justifyContent: 'flex-start' },
  rowUser: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%', padding: '10px 14px',
    borderRadius: 16, fontSize: 14, lineHeight: 1.5,
    wordBreak: 'break-word', whiteSpace: 'pre-wrap'
  },
  bubbleBot: {
    background: '#1a1a2e',
    border: '1px solid rgba(255,255,255,0.07)',
    color: '#e0e0f0',
    borderBottomLeftRadius: 4
  },
  bubbleUser: {
    background: '#667eea',
    color: '#fff',
    borderBottomRightRadius: 4
  },
  inputBar: {
    position: 'fixed', bottom: 60, left: '50%',
    transform: 'translateX(-50%)',
    width: '100%', maxWidth: 480,
    display: 'flex', gap: 8,
    padding: '10px 12px',
    background: '#0f0f1a',
    borderTop: '1px solid rgba(255,255,255,0.07)'
  },
  input: {
    flex: 1, background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 20, padding: '10px 16px',
    color: '#e8e8f0', fontSize: 14, resize: 'none',
    outline: 'none', lineHeight: 1.4,
    fontFamily: 'inherit'
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: '50%',
    background: '#667eea', border: 'none',
    color: '#fff', fontSize: 16, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, alignSelf: 'flex-end'
  },
  sendDisabled: { background: '#333', cursor: 'default' },
  dots: { display: 'inline-flex', gap: 4, alignItems: 'center', height: 16 },
  dot: {
    width: 6, height: 6, borderRadius: '50%',
    background: '#667eea',
    animation: 'typing 1s infinite',
    display: 'inline-block'
  }
}
