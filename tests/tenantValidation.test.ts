import { describe, it, expect, vi, beforeEach } from 'vitest'
import { assertContactBelongsToOrg, assertUserBelongsToOrg } from '../src/utils/tenantValidation'
import { ValidationError } from '../src/utils/AppError'

const mockPrisma = vi.hoisted(() => ({
  contact: { findFirst: vi.fn() },
  membership: { findFirst: vi.fn() },
}))

vi.mock('../src/config/prisma', () => ({ prisma: mockPrisma }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('assertContactBelongsToOrg', () => {
  it('não consulta o banco quando não recebe contactId', async () => {
    await assertContactBelongsToOrg('org_1', undefined)
    expect(mockPrisma.contact.findFirst).not.toHaveBeenCalled()
  })

  it('passa quando o contato pertence à organização', async () => {
    mockPrisma.contact.findFirst.mockResolvedValue({ id: 'contact_1' })
    await expect(assertContactBelongsToOrg('org_1', 'contact_1')).resolves.toBeUndefined()
    expect(mockPrisma.contact.findFirst).toHaveBeenCalledWith({
      where: { id: 'contact_1', organizationId: 'org_1' },
      select: { id: true },
    })
  })

  it('rejeita um contactId de outra organização', async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null)
    await expect(assertContactBelongsToOrg('org_1', 'contact_de_outra_org')).rejects.toThrow(ValidationError)
  })
})

describe('assertUserBelongsToOrg', () => {
  it('não consulta o banco quando não recebe userId', async () => {
    await assertUserBelongsToOrg('org_1', undefined)
    expect(mockPrisma.membership.findFirst).not.toHaveBeenCalled()
  })

  it('passa quando o usuário é membro da organização', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue({ id: 'membership_1' })
    await expect(assertUserBelongsToOrg('org_1', 'user_1')).resolves.toBeUndefined()
  })

  it('rejeita um userId que não é membro da organização', async () => {
    mockPrisma.membership.findFirst.mockResolvedValue(null)
    await expect(assertUserBelongsToOrg('org_1', 'user_de_outra_org')).rejects.toThrow(ValidationError)
  })
})
