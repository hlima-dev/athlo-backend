import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Request, Response } from 'express'
import { requireModulePermission } from '../src/middlewares/requireModulePermission'
import { ForbiddenError, UnauthorizedError } from '../src/utils/AppError'
import { OrgModule, OrgRole } from '@prisma/client'

const mockPrisma = vi.hoisted(() => ({
  modulePermission: {
    findUnique: vi.fn(),
  },
}))

vi.mock('../src/config/prisma', () => ({ prisma: mockPrisma }))

function fakeReq(overrides: Partial<Request> = {}): Request {
  return { ...overrides } as unknown as Request
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('requireModulePermission', () => {
  it('rejeita requisição sem usuário autenticado', async () => {
    const middleware = requireModulePermission(OrgModule.CONTACTS)
    await expect(middleware(fakeReq({ user: undefined }), {} as Response, vi.fn())).rejects.toThrow(
      UnauthorizedError,
    )
  })

  it('OWNER sempre passa, sem consultar o banco', async () => {
    const middleware = requireModulePermission(OrgModule.INVOICES)
    const next = vi.fn()
    const req = fakeReq({ user: { id: 'u1', organizationId: 'org_1', orgRole: OrgRole.OWNER } })

    await middleware(req, {} as Response, next)

    expect(next).toHaveBeenCalledOnce()
    expect(mockPrisma.modulePermission.findUnique).not.toHaveBeenCalled()
  })

  it('ADMIN sempre passa, sem consultar o banco', async () => {
    const middleware = requireModulePermission(OrgModule.PRODUCTS)
    const next = vi.fn()
    const req = fakeReq({ user: { id: 'u1', organizationId: 'org_1', orgRole: OrgRole.ADMIN } })

    await middleware(req, {} as Response, next)

    expect(next).toHaveBeenCalledOnce()
    expect(mockPrisma.modulePermission.findUnique).not.toHaveBeenCalled()
  })

  it('MEMBER sem registro de permissão é bloqueado', async () => {
    mockPrisma.modulePermission.findUnique.mockResolvedValueOnce(null)
    const middleware = requireModulePermission(OrgModule.ORDERS)
    const req = fakeReq({ user: { id: 'u1', organizationId: 'org_1', orgRole: OrgRole.MEMBER } })

    await expect(middleware(req, {} as Response, vi.fn())).rejects.toThrow(ForbiddenError)
  })

  it('MEMBER com enabled:false é bloqueado', async () => {
    mockPrisma.modulePermission.findUnique.mockResolvedValueOnce({ enabled: false })
    const middleware = requireModulePermission(OrgModule.EVENTS)
    const req = fakeReq({ user: { id: 'u1', organizationId: 'org_1', orgRole: OrgRole.MEMBER } })

    await expect(middleware(req, {} as Response, vi.fn())).rejects.toThrow(ForbiddenError)
  })

  it('MEMBER com enabled:true passa', async () => {
    mockPrisma.modulePermission.findUnique.mockResolvedValueOnce({ enabled: true })
    const middleware = requireModulePermission(OrgModule.CONTACTS)
    const next = vi.fn()
    const req = fakeReq({ user: { id: 'u1', organizationId: 'org_1', orgRole: OrgRole.MEMBER } })

    await middleware(req, {} as Response, next)

    expect(next).toHaveBeenCalledOnce()
    expect(mockPrisma.modulePermission.findUnique).toHaveBeenCalledWith({
      where: { userId_module: { userId: 'u1', module: OrgModule.CONTACTS } },
      select: { enabled: true },
    })
  })
})
