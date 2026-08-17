import { describe, it, expect, vi, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { OrgRole } from '@prisma/client'
import { AuthService } from '../src/services/AuthService'

const mockPrisma = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  membership: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  organization: {
    findUnique: vi.fn(),
  },
}))

vi.mock('../src/config/prisma', () => ({ prisma: mockPrisma }))

// A mesma senha em hash real (bcrypt), usada em vários testes.
const PLAIN_PASSWORD = 'Senha@1234'
const PASSWORD_HASH = bcrypt.hashSync(PLAIN_PASSWORD, 4)

function baseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_1',
    email: 'dono@empresa.com',
    password: PASSWORD_HASH,
    name: 'Dono da Empresa',
    organizationId: 'org_1',
    orgRole: OrgRole.OWNER,
    status: 'ACTIVE',
    refreshToken: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    ...overrides,
  }
}

describe('AuthService.login', () => {
  let authService: InstanceType<typeof AuthService>

  beforeEach(() => {
    vi.clearAllMocks()
    authService = new AuthService()
    mockPrisma.user.update.mockResolvedValue({})
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      name: 'Empresa Teste',
      subscription: null,
    })
  })

  it('rejeita e-mail inexistente com mensagem genérica (evita user enumeration)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)

    await expect(
      authService.login({ email: 'ninguem@empresa.com', password: 'qualquer' }),
    ).rejects.toThrow('E-mail ou senha inválidos')
  })

  it('senha errada incrementa failedLoginAttempts', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser({ failedLoginAttempts: 1 }))

    await expect(
      authService.login({ email: 'dono@empresa.com', password: 'senha-errada' }),
    ).rejects.toThrow('E-mail ou senha inválidos')

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { failedLoginAttempts: 2, lockedUntil: null },
    })
  })

  it('bloqueia a conta na 5ª tentativa errada seguida', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser({ failedLoginAttempts: 4 }))

    await expect(
      authService.login({ email: 'dono@empresa.com', password: 'senha-errada' }),
    ).rejects.toThrow('E-mail ou senha inválidos')

    const call = mockPrisma.user.update.mock.calls[0][0]
    expect(call.data.failedLoginAttempts).toBe(0)
    expect(call.data.lockedUntil).toBeInstanceOf(Date)
    expect(call.data.lockedUntil.getTime()).toBeGreaterThan(Date.now())
  })

  it('rejeita login de conta já bloqueada mesmo com a senha certa', async () => {
    const future = new Date(Date.now() + 1000 * 60 * 10)
    mockPrisma.user.findUnique.mockResolvedValue(baseUser({ lockedUntil: future }))

    await expect(
      authService.login({ email: 'dono@empresa.com', password: PLAIN_PASSWORD }),
    ).rejects.toThrow(/bloqueada/)
  })

  it('rejeita conta suspensa', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser({ status: 'SUSPENDED' }))

    await expect(
      authService.login({ email: 'dono@empresa.com', password: PLAIN_PASSWORD }),
    ).rejects.toThrow('Conta suspensa')
  })

  it('login correto com uma única empresa emite sessão direto', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser())
    mockPrisma.membership.findMany.mockResolvedValue([
      {
        organizationId: 'org_1',
        orgRole: OrgRole.OWNER,
        organization: { id: 'org_1', name: 'Empresa Teste', slug: 'empresa-teste' },
      },
    ])

    const result = await authService.login({ email: 'dono@empresa.com', password: PLAIN_PASSWORD })

    expect('requiresOrgSelection' in result).toBe(false)
    if (!('requiresOrgSelection' in result)) {
      expect(result.user.organizationId).toBe('org_1')
      expect(result.accessToken).toBeTruthy()
      expect(result.refreshToken).toBeTruthy()
    }
  })

  it('login correto com mais de uma empresa pede seleção, sem emitir sessão', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser())
    mockPrisma.membership.findMany.mockResolvedValue([
      {
        organizationId: 'org_1',
        orgRole: OrgRole.OWNER,
        organization: { id: 'org_1', name: 'Empresa A', slug: 'empresa-a' },
      },
      {
        organizationId: 'org_2',
        orgRole: OrgRole.MEMBER,
        organization: { id: 'org_2', name: 'Empresa B', slug: 'empresa-b' },
      },
    ])

    const result = await authService.login({ email: 'dono@empresa.com', password: PLAIN_PASSWORD })

    expect('requiresOrgSelection' in result).toBe(true)
    if ('requiresOrgSelection' in result) {
      expect(result.organizations).toHaveLength(2)
      expect(result.preAuthToken).toBeTruthy()
    }
    // Não deve ter emitido/salvo nenhum refreshToken de sessão de verdade
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  it('login correto zera failedLoginAttempts que estavam acumulados', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(baseUser({ failedLoginAttempts: 3 }))
    mockPrisma.membership.findMany.mockResolvedValue([
      {
        organizationId: 'org_1',
        orgRole: OrgRole.OWNER,
        organization: { id: 'org_1', name: 'Empresa Teste', slug: 'empresa-teste' },
      },
    ])

    await authService.login({ email: 'dono@empresa.com', password: PLAIN_PASSWORD })

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    })
  })
})
