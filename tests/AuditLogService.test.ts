import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuditLogService } from '../src/services/AuditLogService'

const mockPrisma = vi.hoisted(() => ({
  auditLog: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
}))

vi.mock('../src/config/prisma', () => ({ prisma: mockPrisma }))

const auditLogService = new AuditLogService()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AuditLogService.record', () => {
  it('grava organização, ator, entidade, ação e resumo', async () => {
    mockPrisma.auditLog.create.mockResolvedValueOnce({})

    await auditLogService.record({
      organizationId: 'org_1',
      userId: 'user_1',
      entityType: 'Contact',
      entityId: 'contact_1',
      action: 'CREATE',
      summary: 'Contato "Ana" criado',
    })

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org_1',
        userId: 'user_1',
        entityType: 'Contact',
        entityId: 'contact_1',
        action: 'CREATE',
        summary: 'Contato "Ana" criado',
      },
    })
  })

  it('não deixa uma falha ao gravar o log derrubar quem chamou', async () => {
    mockPrisma.auditLog.create.mockRejectedValueOnce(new Error('banco fora do ar'))

    await expect(
      auditLogService.record({
        organizationId: 'org_1',
        entityType: 'Contact',
        entityId: 'contact_1',
        action: 'DELETE',
        summary: 'x',
      }),
    ).resolves.toBeUndefined()
  })
})

describe('AuditLogService.list', () => {
  it('escopa por organização e anexa nome/e-mail de quem fez a ação', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValueOnce([
      { id: 'a1', userId: 'user_1', organizationId: 'org_1', entityType: 'Invoice' },
    ])
    mockPrisma.auditLog.count.mockResolvedValueOnce(1)
    mockPrisma.user.findMany.mockResolvedValueOnce([{ id: 'user_1', name: 'Ana', email: 'ana@x.com' }])

    const result = await auditLogService.list('org_1', {}, { page: 1, limit: 20, skip: 0 })

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org_1' }) }),
    )
    expect(result.data[0].user).toEqual({ id: 'user_1', name: 'Ana', email: 'ana@x.com' })
  })

  it('registro sem userId aparece com user: null', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValueOnce([
      { id: 'a1', userId: null, organizationId: 'org_1' },
    ])
    mockPrisma.auditLog.count.mockResolvedValueOnce(1)
    mockPrisma.user.findMany.mockResolvedValueOnce([])

    const result = await auditLogService.list('org_1', {}, { page: 1, limit: 20, skip: 0 })

    expect(result.data[0].user).toBeNull()
  })
})
