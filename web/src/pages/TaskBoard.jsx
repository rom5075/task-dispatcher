// web/src/pages/TaskBoard.jsx

import { useState, useEffect } from 'react'

export default function TaskBoard({ token, onLogout }) {
  const [lists, setLists] = useState([])
  const [tasks, setTasks] = useState([])
  const [activeList, setActiveList] = useState(null) // null = все задачи
  const [loading, setLoading] = useState(true)

  const headers = { 'x-auth-token': token }

  useEffect(() => {
    loadLists()
  }, [])

  useEffect(() => {
    loadTasks()
  }, [activeList])

  async function loadLists() {
    try {
      const res = await fetch('/api/lists', { headers })
      const data = await res.json()
      const active = data.filter(l => !l.is_done)
      setLists(active)
      setLoading(false)
    } catch (e) {
      console.error(e)
      setLoading(false)
    }
  }

  async function loadTasks() {
    setLoading(true)
    try {
      const url = activeList ? `/api/tasks?listId=${activeList}` : '/api/tasks'
      const res = await fetch(url, { headers })
      const data = await res.json()
      setTasks(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const activeListName = lists.find(l => l.list_id === activeList)?.name || 'Все задачи'

  return (
    <div style={s.wrap}>
      {/* Хедер */}
      <header style={s.header}>
        <h1 style={s.logo}>🗂️ Tasks</h1>
        <button style={s.logoutBtn} onClick={onLogout} title="Выйти">⬡</button>
      </header>

      {/* Табы проектов */}
      <div style={s.tabs}>
        <button
          style={{ ...s.tab, ...(activeList === null ? s.tabActive : {}) }}
          onClick={() => setActiveList(null)}
        >
          Все
        </button>
        {lists.map(l => (
          <button
            key={l.list_id}
            style={{ ...s.tab, ...(activeList === l.list_id ? s.tabActive : {}) }}
            onClick={() => setActiveList(l.list_id)}
          >
            {l.name}
          </button>
        ))}
      </div>

      {/* Заголовок раздела */}
      <div style={s.sectionHeader}>
        <span style={s.sectionTitle}>{activeListName}</span>
        <span style={s.taskCount}>{tasks.length} задач</span>
      </div>

      {/* Список задач */}
      <div style={s.taskList}>
        {loading ? (
          <div style={s.empty}>⏳ Загрузка...</div>
        ) : tasks.length === 0 ? (
          <div style={s.empty}>✨ Задач нет</div>
        ) : (
          tasks.map(task => (
            <TaskCard key={task.id} task={task} showList={activeList === null} />
          ))
        )}
      </div>
    </div>
  )
}

function TaskCard({ task, showList }) {
  return (
    <div style={s.card}>
      <div style={s.cardContent}>
        <p style={s.taskTitle}>{task.title}</p>
        {task.description && (
          <p style={s.taskDesc}>{task.description}</p>
        )}
        {showList && task.list_name && (
          <span style={s.listBadge}>{task.list_name}</span>
        )}
      </div>
      <div style={s.cardDate}>
        {formatDate(task.created_at)}
      </div>
    </div>
  )
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

const s = {
  wrap: {
    maxWidth: 480, margin: '0 auto',
    padding: '0 0 80px',
    minHeight: '100vh',
    background: '#0f0f1a'
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.06)'
  },
  logo: { fontSize: 20, fontWeight: 700, color: '#fff' },
  logoutBtn: {
    background: 'none', border: 'none', color: '#555',
    fontSize: 20, cursor: 'pointer', padding: 4
  },
  tabs: {
    display: 'flex', gap: 8, padding: '16px 20px',
    overflowX: 'auto', scrollbarWidth: 'none'
  },
  tab: {
    padding: '8px 16px', borderRadius: 20,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: '#888', fontSize: 13, cursor: 'pointer',
    whiteSpace: 'nowrap', transition: 'all 0.2s'
  },
  tabActive: {
    background: 'rgba(102,126,234,0.25)',
    border: '1px solid rgba(102,126,234,0.5)',
    color: '#a8b5ff'
  },
  sectionHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '4px 20px 12px'
  },
  sectionTitle: { fontSize: 15, fontWeight: 600, color: '#ccc' },
  taskCount: { fontSize: 12, color: '#555' },
  taskList: { padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 },
  card: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 12, padding: '14px 16px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    gap: 12
  },
  cardContent: { flex: 1, minWidth: 0 },
  taskTitle: { fontSize: 14, color: '#e8e8f0', lineHeight: 1.4, marginBottom: 4 },
  taskDesc: { fontSize: 12, color: '#666', lineHeight: 1.4, marginBottom: 6 },
  listBadge: {
    display: 'inline-block', padding: '2px 8px',
    background: 'rgba(102,126,234,0.15)',
    border: '1px solid rgba(102,126,234,0.3)',
    borderRadius: 10, fontSize: 11, color: '#8899dd'
  },
  cardDate: { fontSize: 11, color: '#444', whiteSpace: 'nowrap', marginTop: 2 },
  empty: { textAlign: 'center', padding: '60px 20px', color: '#444', fontSize: 14 }
}
