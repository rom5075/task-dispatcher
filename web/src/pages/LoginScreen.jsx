// web/src/pages/LoginScreen.jsx

export default function LoginScreen({ onPasskey, error }) {
  return (
    <div style={s.wrap}>
      <div style={s.card}>
        <div style={s.icon}>🗂️</div>
        <h1 style={s.title}>Task Dispatcher</h1>
        <p style={s.sub}>Личный менеджер задач</p>

        <button style={s.btn} onClick={onPasskey}>
          <span style={s.faceId}>🔒</span>
          Войти с Face ID / Touch ID
        </button>

        {error && <p style={s.error}>{error}</p>}

        <p style={s.hint}>
          Нет passkey? Получи ссылку-токен<br/>через бота командой /webapp
        </p>
      </div>
    </div>
  )
}

const s = {
  wrap: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '100vh', padding: 20,
    background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%)'
  },
  card: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 20,
    padding: '40px 32px',
    maxWidth: 360,
    width: '100%',
    textAlign: 'center',
    backdropFilter: 'blur(20px)'
  },
  icon: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: 700, color: '#fff', marginBottom: 6 },
  sub: { fontSize: 14, color: '#888', marginBottom: 32 },
  btn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 10, width: '100%', padding: '14px 24px',
    background: 'linear-gradient(135deg, #667eea, #764ba2)',
    color: '#fff', border: 'none', borderRadius: 12,
    fontSize: 16, fontWeight: 600, cursor: 'pointer',
    transition: 'opacity 0.2s'
  },
  faceId: { fontSize: 20 },
  error: {
    marginTop: 16, padding: '10px 14px',
    background: 'rgba(255,80,80,0.15)',
    border: '1px solid rgba(255,80,80,0.3)',
    borderRadius: 8, color: '#ff8080', fontSize: 14
  },
  hint: {
    marginTop: 24, fontSize: 12, color: '#555', lineHeight: 1.6
  }
}
