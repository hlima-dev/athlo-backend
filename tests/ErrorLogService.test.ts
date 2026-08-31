import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ErrorLogService } from '../src/services/ErrorLogService'
import { NotFoundError } from '../src/utils/AppError'

const mockPrisma = vi.hoisted(() => ({
  errorLog: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
  organization: {
    findMany: vi.fn(),
  },
}))

vi.mock('../src/config/prisma', () => ({ prisma: mockPrisma }))

function fakeRequest(overrides: Record<string, unknown> = {}) {
  return {
    method: 'GET',
    originalUrl: '/api/v1/contacts',
    user: { id: 'user_1', organizationId: 'org_1' },
    ...overrides,
  } as any
}

const errorLogService = new ErrorLogService()

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ErrorLogService.record', () => {
  it('grava a mensagem, o método e o caminho da requisição', async () => {
    mockPrisma.errorLog.create.mockResolvedValueOnce({})

    await errorLogService.record(new Error('Falha inesperada'), fakeRequest())

    expect(mockPrisma.errorLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        message: 'Falha inesperada',
        statusCode: 500,
        method: 'GET',
        path: '/api/v1/contacts',
        userId: 'user_1',
        organizationId: 'org_1',
      }),
    })
  })

  it('não deixa uma falha ao gravar o log derrubar quem chamou', async () => {
    mockPrisma.errorLog.create.mockRejectedValueOnce(new Error('banco fora do ar'))

    await expect(errorLogService.record(new Error('x'), fakeRequest())).resolves.toBeUndefined()
  })

  it('funciona sem usuário autenticado (rota pública)', async () => {
    mockPrisma.errorLog.create.mockResolvedValueOnce({})

    await errorLogService.record(new Error('x'), fakeRequest({ user: undefined }))

    expect(mockPrisma.errorLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: undefined, organizationId: undefined }),
    })
  })
})

describe('ErrorLogService.list', () => {
  it('anexa nome do usuário e da organização sem duplicar no schema', async () => {
    mockPrisma.errorLog.findMany.mockResolvedValueOnce([
      { id: 'e1', userId: 'user_1', organizationId: 'org_1' },
    ])
    mockPrisma.errorLog.count.mockResolvedValueOnce(1)
    mockPrisma.user.findMany.mockResolvedValueOnce([{ id: 'user_1', name: 'Ana', email: 'ana@x.com' }])
    mockPrisma.organization.findMany.mockResolvedValueOnce([{ id: 'org_1', name: 'Empresa X' }])

    const result = await errorLogService.list({}, { page: 1, limit: 20, skip: 0 })

    expect(result.data[0].user).toEqual({ id: 'user_1', name: 'Ana', email: 'ana@x.com' })
    expect(result.data[0].organization).toEqual({ id: 'org_1', name: 'Empresa X' })
  })
})

describe('ErrorLogService.resolve', () => {
  it('rejeita id inexistente', async () => {
    mockPrisma.errorLog.findUnique.mockResolvedValueOnce(null)

    await expect(errorLogService.resolve('inexistente')).rejects.toThrow(NotFoundError)
  })

  it('marca resolvedAt', async () => {
    mockPrisma.errorLog.findUnique.mockResolvedValueOnce({ id: 'e1' })
    mockPrisma.errorLog.update.mockResolvedValueOnce({ id: 'e1', resolvedAt: new Date() })

    await errorLogService.resolve('e1')

    expect(mockPrisma.errorLog.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: { resolvedAt: expect.any(Date) },
    })
  })
})
