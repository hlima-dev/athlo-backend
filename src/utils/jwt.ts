import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { OrgRole } from '@prisma/client'

interface TokenPayload {
  sub: string
  organizationId: string
  orgRole: OrgRole
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  } as jwt.SignOptions)
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions)
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload
}

export function generateTokenPair(payload: TokenPayload) {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  }
}

interface PreAuthPayload {
  sub: string
  preAuth: true
}

// Token de curtíssima duração emitido depois que a senha já foi validada,
// mas antes de saber qual organização usar (quando o login tem mais de
// uma). Evita pedir a senha de novo só para escolher a empresa.
export function generatePreAuthToken(userId: string): string {
  return jwt.sign({ sub: userId, preAuth: true } as PreAuthPayload, env.JWT_SECRET, {
    expiresIn: '5m',
  })
}

export function verifyPreAuthToken(token: string): string {
  const payload = jwt.verify(token, env.JWT_SECRET) as PreAuthPayload
  if (!payload.preAuth) {
    throw new Error('Token inválido')
  }
  return payload.sub
}
