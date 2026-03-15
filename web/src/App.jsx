// web/src/App.jsx

import { useState, useEffect } from 'react'
import { useAuth } from './hooks/useAuth.js'
import LoginScreen from './pages/LoginScreen.jsx'
import TaskBoard from './pages/TaskBoard.jsx'

export default function App() {
  const { token, status, error, loginWithPasskey, logout } = useAuth()

  if (status === 'loading') {
    return (
      <div style={styles.center}>
        <div style={styles.spinner}>⏳</div>
        <p style={styles.hint}>Загрузка...</p>
      </div>
    )
  }

  if (status === 'auth') {
    return <LoginScreen onPasskey={loginWithPasskey} error={error} />
  }

  return <TaskBoard token={token} onLogout={logout} />
}

const styles = {
  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '100vh', gap: 12
  },
  spinner: { fontSize: 40 },
  hint: { color: '#888', fontSize: 14 }
}
