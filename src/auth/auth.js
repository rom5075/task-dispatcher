// src/auth/auth.js — токены + WebAuthn Passkey

import crypto from 'crypto'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from '@simplewebauthn/server'
import {
  saveAccessToken, getProfileByToken,
  savePasskeyChallenge, savePasskeyCredential,
  getPasskeyCredential, recordAuthAttempt,
  getRecentAuthAttempts, getDailyAuthAttempts
} from '../db/sqlite.js'

const RP_NAME = process.env.PASSKEY_RP_NAME || 'Task Dispatcher'
const RP_ID   = process.env.PASSKEY_RP_ID   || 'localhost'
const ORIGIN  = process.env.APP_URL          || 'http://localhost:3001'

// ─── Access Token ─────────────────────────────────────────────────────────────

export function generateAccessToken() {
  return crypto.randomBytes(48).toString('hex') // 96 символов
}

export function createAccessTokenForUser(userId) {
  const token = generateAccessToken()
  saveAccessToken(userId, token)
  return token
}

export function validateAccessToken(token) {
  if (!token || token.length < 32) return null
  return getProfileByToken(token)
}

// ─── Passkey Registration ─────────────────────────────────────────────────────

export async function beginPasskeyRegistration(userId, userName) {
  // Используем plain Uint8Array (не Buffer) чтобы избежать проблем сериализации
  const userIdBytes = Uint8Array.from(Buffer.from(String(userId)))

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: userIdBytes,
    userName: userName || 'user',
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'required'
    }
  })

  // Гарантируем что challenge и user.id — строки (base64url), а не Buffer/Uint8Array
  const toBase64url = (val) => {
    if (typeof val === 'string') return val
    return Buffer.from(val).toString('base64url')
  }

  const safeOptions = {
    ...options,
    challenge: toBase64url(options.challenge),
    user: {
      ...options.user,
      id: toBase64url(options.user?.id ?? userIdBytes)
    }
  }

  savePasskeyChallenge(userId, safeOptions.challenge)
  return safeOptions
}

export async function finishPasskeyRegistration(userId, response) {
  const data = getPasskeyCredential(userId)
  if (!data?.challenge) throw new Error('Challenge не найден')

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: data.challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: true
  })

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('Passkey регистрация не прошла верификацию')
  }

  const info = verification.registrationInfo

  // Совместимость с @simplewebauthn/server v9 (credentialID) и v10 (credential.id)
  const toB64 = (val) => {
    if (!val) return undefined
    if (typeof val === 'string') return val
    return Buffer.from(val).toString('base64url')
  }
  const credId      = toB64(info.credential?.id ?? info.credentialID)
  const credPubKey  = info.credential?.publicKey ?? info.credentialPublicKey
  const credCounter = info.credential?.counter   ?? info.counter ?? 0

  if (!credId || !credPubKey) throw new Error('Не удалось извлечь данные credential')

  savePasskeyCredential(userId, {
    id: credId,
    publicKey: Buffer.from(credPubKey).toString('base64'),
    counter: credCounter,
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
  })

  return true
}

// ─── Passkey Authentication ───────────────────────────────────────────────────

export async function beginPasskeyAuth(userId) {
  const data = getPasskeyCredential(userId)
  if (!data?.credential) throw new Error('Passkey не настроен')

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: [{ id: data.credential.id, type: 'public-key' }],
    userVerification: 'required'
  })

  savePasskeyChallenge(userId, options.challenge)
  return options
}

export async function finishPasskeyAuth(userId, response) {
  const data = getPasskeyCredential(userId)
  if (!data?.credential || !data?.challenge) throw new Error('Данные не найдены')

  const credential = data.credential
  const pubKeyBuf = Buffer.from(credential.publicKey, 'base64')

  // Совместимость: v10 использует credential{}, v9 использует authenticator{}
  const verifyParams = {
    response,
    expectedChallenge: data.challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: true,
    // v10 API
    credential: { id: credential.id, publicKey: pubKeyBuf, counter: credential.counter },
    // v9 API fallback
    authenticator: { credentialID: Buffer.from(credential.id, 'base64url'), credentialPublicKey: pubKeyBuf, counter: credential.counter },
  }

  const verification = await verifyAuthenticationResponse(verifyParams)

  if (!verification.verified) throw new Error('Passkey аутентификация не прошла')

  // Обновляем counter (совместимо с v9 и v10)
  credential.counter = verification.authenticationInfo?.newCounter ?? credential.counter
  savePasskeyCredential(userId, credential)

  return true
}

// ─── Rate Limiting для auth ───────────────────────────────────────────────────

export function checkRateLimit(ip) {
  const recent = getRecentAuthAttempts(ip, 15)  // за 15 минут
  const daily  = getDailyAuthAttempts(ip)

  if (recent >= 3)  return { blocked: true, reason: 'Слишком много попыток. Подождите 15 минут.' }
  if (daily  >= 10) return { blocked: true, reason: 'Превышен дневной лимит попыток.' }
  
  return { blocked: false }
}

export { recordAuthAttempt }
