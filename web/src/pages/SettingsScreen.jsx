// web/src/pages/SettingsScreen.jsx

import { useState } from 'react'
import { startRegistration } from '@simplewebauthn/browser'

export default function SettingsScreen({ token, onLogout }) {
  const [passkeyStatus, setPasskeyStatus] = useState(null) // null | 'loading' | 'success' | 'error'
  const [passkeyMsg, setPasskeyMsg] = useState('')

  async function registerPasskey() {
    setPasskeyStatus('loading')
    setPasskeyMsg('')
    try {
      // 1. Получаем options от сервера
      const beginRes = await fetch('/api/auth/passkey/register/begin', {
        method: 'POST',
        headers: { 'x-auth-token': token }
      })
      if (!beginRes.ok) {
        const err = await beginRes.json()
        throw new Error(err.error || 'Ошибка сервера')
      }
      const options = await beginRes.json()

      // 2. Запускаем биометрию (прямой вызов — совместим с v9 и v10)
      const response = await startRegistration(options)

      // 3. Отправляем результат
      const finishRes = await fetch('/api/auth/passkey/register/finish', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify(response)
      })
      if (!finishRes.ok) {
        const err = await finishRes.json()
        throw new Error(err.error || 'Ошибка регистрации')
      }

      setPasskeyStatus('success')
      setPasskeyMsg('Passkey зарегистрирован! Теперь можно входить по Face ID / Touch ID.')
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        setPasskeyStatus('error')
        setPasskeyMsg('Регистрация отменена')
      } else {
        setPasskeyStatus('error')
        setPasskeyMsg(e.message || 'Ошибка регистрации passkey')
      }
    }
  }

  return (
    <div style={s.wrap}>
      <header style={s.header}>
        <h1 style={s.title}>⚙️ Настройки</h1>
      </header>

      <div style={s.section}>
        <h2 style={s.sectionTitle}>Авторизация</h2>

        <div style={s.card}>
          <div style={s.cardRow}>
            <div>
              <p style={s.cardLabel}>Face ID / Touch ID</p>
              <p style={s.cardHint}>Входи без токена через биометрию устройства</p>
            </div>
            <span style={s.cardIcon}>🔒</span>
          </div>
          <button
            style={{ ...s.btn, ...(passkeyStatus === 'loading' ? s.btnDisabled : {}) }}
            onClick={registerPasskey}
            disabled={passkeyStatus === 'loading'}
          >
            {passkeyStatus === 'loading' ? 'Регистрация...' : 'Зарегистрировать Passkey'}
          </button>
          {passkeyStatus === 'success' && <p style={s.msgSuccess}>{passkeyMsg}</p>}
          {passkeyStatus === 'error' && <p style={s.msgError}>{passkeyMsg}</p>}
        </div>
      </div>

      <div style={s.section}>
        <h2 style={s.sectionTitle}>Аккаунт</h2>
        <div style={s.card}>
          <div style={s.cardRow}>
            <div>
              <p style={s.cardLabel}>Выйти</p>
              <p style={s.cardHint}>Удалить токен с этого устройства</p>
            </div>
            <span style={s.cardIcon}>🚪</span>
          </div>
          <button style={{ ...s.btn, ...s.btnDanger }} onClick={onLogout}>
            Выйти из аккаунта
          </button>
        </div>
      </div>
    </div>
  )
}

const s = {
  wrap: {
    maxWidth: 480, margin: '0 auto',
    minHeight: '100vh', background: '#0f0f1a',
    paddingBottom: 80
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.06)'
  },
  title: { fontSize: 20, fontWeight: 700, color: '#fff' },
  section: { padding: '20px 16px 0' },
  sectionTitle: { fontSize: 12, color: '#555', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, paddingLeft: 4 },
  card: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 14, padding: '16px',
    display: 'flex', flexDirection: 'column', gap: 12
  },
  cardRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLabel: { fontSize: 14, color: '#e8e8f0', fontWeight: 500, marginBottom: 3 },
  cardHint: { fontSize: 12, color: '#555', lineHeight: 1.4 },
  cardIcon: { fontSize: 22 },
  btn: {
    width: '100%', padding: '12px',
    background: 'linear-gradient(135deg, #667eea, #764ba2)',
    color: '#fff', border: 'none', borderRadius: 10,
    fontSize: 14, fontWeight: 600, cursor: 'pointer'
  },
  btnDisabled: { opacity: 0.5, cursor: 'default' },
  btnDanger: { background: 'rgba(255,80,80,0.15)', color: '#ff8080' },
  msgSuccess: {
    fontSize: 13, color: '#6fcf97', lineHeight: 1.4,
    padding: '8px 12px', background: 'rgba(111,207,151,0.1)',
    borderRadius: 8, border: '1px solid rgba(111,207,151,0.2)'
  },
  msgError: {
    fontSize: 13, color: '#ff8080', lineHeight: 1.4,
    padding: '8px 12px', background: 'rgba(255,80,80,0.1)',
    borderRadius: 8, border: '1px solid rgba(255,80,80,0.2)'
  }
}
