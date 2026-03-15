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
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: Buffer.from(String(userId)),
    userName: userName || 'user',
    attestationType: 'none',
    authenticatorSelection: {
      authenticatorAttachment: 'platform', // встроенный (Face ID / Touch ID)
      userVerification: 'required'
    }
  })
  
  savePasskeyChallenge(userId, options.challenge)
  return options
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

  savePasskeyCredential(userId, {
    id: verification.registrationInfo.credential.id,
    publicKey: Buffer.from(verification.registrationInfo.credential.publicKey).toString('base64'),
    counter: verification.registrationInfo.credential.counter,
    deviceType: verification.registrationInfo.credentialDeviceType,
    backedUp: verification.registrationInfo.credentialBackedUp,
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
  
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: data.challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    credential: {
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey, 'base64'),
      counter: credential.counter,
    },
    requireUserVerification: true
  })

  if (!verification.verified) throw new Error('Passkey аутентификация не прошла')

  // Обновляем counter
  credential.counter = verification.authenticationInfo.newCounter
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
