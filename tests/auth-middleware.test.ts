import { describe, it, expect, vi } from 'vitest'
import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { authenticate } from '../src/middlewares/auth'
import { ACCESS_COOKIE } from '../src/utils/authCookies'
import { UnauthorizedError } from '../src/utils/AppError'
import { OrgRole } from '@prisma/client'

function fakeReq(overrides: Partial<Request>): Request {
  return { headers: {}, cookies: {}, ...overrides } as unknown as Request
}

const payload = { sub: 'user_1', organizationId: 'org_1', orgRole: OrgRole.MEMBER }

describe('middlewares/auth — authenticate', () => {
  it('rejeita quando não há cookie nem header', () => {
    const req = fakeReq({})
    expect(() => authenticate(req, {} as Response, vi.fn())).toThrow(UnauthorizedError)
  })

  it('autentica via cookie httpOnly e popula req.user', () => {
    const token = jwt.sign(payload, process.env.JWT_SECRET!)
    const req = fakeReq({ cookies: { [ACCESS_COOKIE]: token } })
    const next = vi.fn()

    authenticate(req, {} as Response, next)

    expect(next).toHaveBeenCalledOnce()
    expect(req.user).toEqual({
      id: payload.sub,
      organizationId: payload.organizationId,
      orgRole: payload.orgRole,
    })
  })

  it('autentica via header Authorization: Bearer como alternativa', () => {
    const token = jwt.sign(payload, process.env.JWT_SECRET!)
    const req = fakeReq({ headers: { authorization: `Bearer ${token}` } })
    const next = vi.fn()

    authenticate(req, {} as Response, next)

    expect(next).toHaveBeenCalledOnce()
    expect(req.user?.id).toBe(payload.sub)
  })

  it('prioriza o cookie sobre o header quando os dois existem', () => {
    const cookieToken = jwt.sign({ ...payload, sub: 'do-cookie' }, process.env.JWT_SECRET!)
    const headerToken = jwt.sign({ ...payload, sub: 'do-header' }, process.env.JWT_SECRET!)
    const req = fakeReq({
      cookies: { [ACCESS_COOKIE]: cookieToken },
      headers: { authorization: `Bearer ${headerToken}` },
    })
    const next = vi.fn()

    authenticate(req, {} as Response, next)

    expect(req.user?.id).toBe('do-cookie')
  })

  it('rejeita um token assinado com segredo errado', () => {
    const token = jwt.sign(payload, 'segredo-errado-completamente-diferente')
    const req = fakeReq({ cookies: { [ACCESS_COOKIE]: token } })
    expect(() => authenticate(req, {} as Response, vi.fn())).toThrow(UnauthorizedError)
  })

  it('rejeita um token expirado', () => {
    const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: -10 })
    const req = fakeReq({ cookies: { [ACCESS_COOKIE]: token } })
    expect(() => authenticate(req, {} as Response, vi.fn())).toThrow(UnauthorizedError)
  })
})
