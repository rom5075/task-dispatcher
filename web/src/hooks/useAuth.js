// web/src/hooks/useAuth.js

import { useState, useEffect } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'

const TOKEN_KEY = 'task_dispatcher_token'

export function useAuth() {
  const [token, setToken] = useState(null)
  const [status, setStatus] = useState('loading') // loading | auth | ready | error
  const [error, setError] = useState('')

  useEffect(() => {
    initAuth()
  }, [])

  async function initAuth() {
    // 1. Проверяем токен из URL (?token=...)
    const urlParams = new URLSearchParams(window.location.search)
    const urlToken = urlParams.get('token')
    if (urlToken) {
      const valid = await validateToken(urlToken)
      if (valid) {
        localStorage.setItem(TOKEN_KEY, urlToken)
        // Убираем токен из URL (безопасность)
        window.history.replaceState({}, '', window.location.pathname)
        setToken(urlToken)
        setStatus('ready')
        return
      }
    }

    // 2. Проверяем Telegram Web App
    const tg = window.Telegram?.WebApp
    if (tg?.initData) {
      const tgToken = await loginViaTelegram(tg.initData)
      if (tgToken) {
        localStorage.setItem(TOKEN_KEY, tgToken)
        setToken(tgToken)
        setStatus('ready')
        return
      }
    }

    // 3. Проверяем сохранённый токен в localStorage
    const savedToken = localStorage.getItem(TOKEN_KEY)
    if (savedToken) {
      const valid = await validateToken(savedToken)
      if (valid) {
        setToken(savedToken)
        setStatus('ready')
        return
      }
      localStorage.removeItem(TOKEN_KEY)
    }

    // 4. Нужна авторизация — показываем Passkey
    setStatus('auth')
  }

  async function validateToken(t) {
    try {
      const res = await fetch('/api/auth/validate', {
        headers: { 'x-auth-token': t }
      })
      return res.ok
    } catch {
      return false
    }
  }

  async function loginViaTelegram(initData) {
    try {
      const res = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData })
      })
      if (!res.ok) return null
      const data = await res.json()
      return data.token
    } catch {
      return null
    }
  }

  async function loginWithPasskey() {
    setError('')
    try {
      // 1. Получаем challenge от сервера
      const beginRes = await fetch('/api/auth/passkey/auth/begin', { method: 'POST' })
      if (!beginRes.ok) {
        const err = await beginRes.json()
        setError(err.error || 'Ошибка сервера')
        return
      }
      const options = await beginRes.json()

      // 2. Запускаем Face ID / Touch ID
      const response = await startAuthentication({ optionsJSON: options })

      // 3. Отправляем результат на сервер
      const finishRes = await fetch('/api/auth/passkey/auth/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response)
      })

      if (!finishRes.ok) {
        const err = await finishRes.json()
        setError(err.error || 'Авторизация не прошла')
        return
      }

      const { token: newToken } = await finishRes.json()
      localStorage.setItem(TOKEN_KEY, newToken)
      setToken(newToken)
      setStatus('ready')

    } catch (e) {
      if (e.name === 'NotAllowedError') {
        setError('Авторизация отменена')
      } else {
        setError(e.message || 'Ошибка passkey')
      }
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setStatus('auth')
  }

  return { token, status, error, loginWithPasskey, logout }
}
