// web/src/App.jsx

import { useState } from 'react'
import { useAuth } from './hooks/useAuth.js'
import LoginScreen from './pages/LoginScreen.jsx'
import TaskBoard from './pages/TaskBoard.jsx'
import ChatScreen from './pages/ChatScreen.jsx'
import SettingsScreen from './pages/SettingsScreen.jsx'

export default function App() {
  const { token, status, error, loginWithPasskey, logout } = useAuth()
  const [tab, setTab] = useState('tasks') // 'tasks' | 'chat' | 'settings'

  if (status === 'loading') {
    return (
      <div style={s.center}>
        <div style={s.spinner}>⏳</div>
        <p style={s.hint}>Загрузка...</p>
      </div>
    )
  }

  if (status === 'auth') {
    return <LoginScreen onPasskey={loginWithPasskey} error={error} />
  }

  return (
    <div style={s.app}>
      {tab === 'tasks' && <TaskBoard token={token} onLogout={logout} />}
      {tab === 'chat' && <ChatScreen token={token} />}
      {tab === 'settings' && <SettingsScreen token={token} onLogout={logout} />}

      {/* Нижняя навигация */}
      <nav style={s.tabBar}>
        <button style={s.tabBtn} onClick={() => setTab('tasks')}>
          <span style={s.tabIcon}>🗂️</span>
          <span style={{ ...s.tabLabel, color: tab === 'tasks' ? '#a8b5ff' : '#555' }}>Задачи</span>
        </button>
        <button style={s.tabBtn} onClick={() => setTab('chat')}>
          <span style={s.tabIcon}>💬</span>
          <span style={{ ...s.tabLabel, color: tab === 'chat' ? '#a8b5ff' : '#555' }}>Чат</span>
        </button>
        <button style={s.tabBtn} onClick={() => setTab('settings')}>
          <span style={s.tabIcon}>⚙️</span>
          <span style={{ ...s.tabLabel, color: tab === 'settings' ? '#a8b5ff' : '#555' }}>Настройки</span>
        </button>
      </nav>
    </div>
  )
}

const s = {
  app: { position: 'relative', minHeight: '100vh' },
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh', gap: 12
  },
  spinner: { fontSize: 40 },
  hint: { color: '#888', fontSize: 14 },
  tabBar: {
    position: 'fixed', bottom: 0, left: '50%',
    transform: 'translateX(-50%)',
    width: '100%', maxWidth: 480,
    display: 'flex',
    background: '#13131f',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    zIndex: 100
  },
  tabBtn: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    gap: 2, padding: '8px 0',
    background: 'none', border: 'none', cursor: 'pointer'
  },
  tabBtnActive: {},
  tabIcon: { fontSize: 20 },
  tabLabel: { fontSize: 11, color: '#666' }
}
