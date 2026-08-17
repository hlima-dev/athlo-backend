import { describe, it, expect } from 'vitest'
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateTokenPair,
  generatePreAuthToken,
  verifyPreAuthToken,
} from '../src/utils/jwt'
import { OrgRole } from '@prisma/client'

describe('utils/jwt', () => {
  const payload = { sub: 'user_1', organizationId: 'org_1', orgRole: OrgRole.OWNER }

  it('gera um access token e um refresh token válidos', () => {
    const tokens = generateTokenPair(payload)
    expect(typeof tokens.accessToken).toBe('string')
    expect(typeof tokens.refreshToken).toBe('string')
    expect(tokens.accessToken).not.toBe(tokens.refreshToken)
  })

  it('verifyRefreshToken devolve o payload original', () => {
    const refreshToken = generateRefreshToken(payload)
    const decoded = verifyRefreshToken(refreshToken)
    expect(decoded.sub).toBe(payload.sub)
    expect(decoded.organizationId).toBe(payload.organizationId)
    expect(decoded.orgRole).toBe(payload.orgRole)
  })

  it('verifyRefreshToken rejeita um token de access (assinado com outro segredo)', () => {
    const accessToken = generateAccessToken(payload)
    expect(() => verifyRefreshToken(accessToken)).toThrow()
  })

  it('verifyRefreshToken rejeita um token corrompido', () => {
    expect(() => verifyRefreshToken('token.invalido.aqui')).toThrow()
  })

  describe('pré-autenticação (seleção de organização)', () => {
    it('gera e verifica um preAuthToken válido', () => {
      const token = generatePreAuthToken('user_42')
      expect(verifyPreAuthToken(token)).toBe('user_42')
    })

    it('rejeita um access token comum como se fosse preAuthToken', () => {
      const accessToken = generateAccessToken(payload)
      expect(() => verifyPreAuthToken(accessToken)).toThrow()
    })
  })
})
