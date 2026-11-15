import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InsumoService } from '../src/services/InsumoService'

const mockPrisma = vi.hoisted(() => ({
  insumo: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  insumoPrice: { create: vi.fn(), findMany: vi.fn() },
  contact: { findFirst: vi.fn() },
}))

vi.mock('../src/config/prisma', () => ({ prisma: mockPrisma }))
vi.mock('../src/services/AuditLogService', () => ({
  AuditLogService: class {
    record = vi.fn()
  },
}))

const insumoService = new InsumoService()
const pagination = { page: 1, limit: 20, skip: 0 }

beforeEach(() => {
  vi.clearAllMocks()
})

function makePrice(overrides: Record<string, unknown> = {}) {
  return {
    contactId: 'c1',
    price: 10,
    isPromo: false,
    validUntil: null,
    recordedAt: new Date('2026-01-01'),
    contact: { id: 'c1', name: 'Fornecedor A' },
    ...overrides,
  }
}

describe('InsumoService.create', () => {
  it('cria o insumo vinculado à organização', async () => {
    mockPrisma.insumo.create.mockResolvedValue({ id: 'insumo_1', name: 'Chocolate', unit: 'kg' })

    const result = await insumoService.create('org_1', { name: 'Chocolate', unit: 'kg' })

    expect(mockPrisma.insumo.create).toHaveBeenCalledWith({
      data: { name: 'Chocolate', unit: 'kg', organizationId: 'org_1' },
    })
    expect(result.id).toBe('insumo_1')
  })
})

describe('InsumoService.findAll — cálculo de bestPrice', () => {
  it('ignora promoção vencida e escolhe o preço vigente mais barato', async () => {
    const prices = [
      makePrice({ contactId: 'c1', price: 5, isPromo: true, validUntil: new Date('2020-01-01'), contact: { id: 'c1', name: 'Loja Vencida' } }),
      makePrice({ contactId: 'c2', price: 8, contact: { id: 'c2', name: 'Loja B' } }),
      makePrice({ contactId: 'c3', price: 6, isPromo: true, validUntil: new Date('2099-01-01'), contact: { id: 'c3', name: 'Loja C' } }),
    ]
    mockPrisma.insumo.findMany.mockResolvedValue([{ id: 'insumo_1', name: 'Chocolate', unit: 'kg', prices }])
    mockPrisma.insumo.count.mockResolvedValue(1)

    const result = await insumoService.findAll('org_1', {}, pagination)

    expect(result.data[0].bestPrice).toEqual({ price: 6, contactId: 'c3', contactName: 'Loja C' })
  })

  it('considera só o registro mais recente de cada fornecedor', async () => {
    const prices = [
      makePrice({ contactId: 'c1', price: 20, recordedAt: new Date('2026-01-01') }),
      makePrice({ contactId: 'c1', price: 9, recordedAt: new Date('2026-02-01') }),
    ]
    mockPrisma.insumo.findMany.mockResolvedValue([{ id: 'insumo_1', name: 'Chocolate', unit: 'kg', prices }])
    mockPrisma.insumo.count.mockResolvedValue(1)

    const result = await insumoService.findAll('org_1', {}, pagination)

    expect(result.data[0].bestPrice?.price).toBe(9)
  })

  it('retorna null quando não há nenhuma cotação vigente', async () => {
    const prices = [makePrice({ isPromo: true, validUntil: new Date('2020-01-01') })]
    mockPrisma.insumo.findMany.mockResolvedValue([{ id: 'insumo_1', name: 'Chocolate', unit: 'kg', prices }])
    mockPrisma.insumo.count.mockResolvedValue(1)

    const result = await insumoService.findAll('org_1', {}, pagination)

    expect(result.data[0].bestPrice).toBeNull()
  })
})

describe('InsumoService.addPrice', () => {
  it('rejeita fornecedor que não pertence à organização', async () => {
    mockPrisma.insumo.findFirst.mockResolvedValue({ id: 'insumo_1', name: 'Chocolate' })
    mockPrisma.contact.findFirst.mockResolvedValue(null)

    await expect(
      insumoService.addPrice('org_1', 'insumo_1', { contactId: 'contact_de_outra_org', price: 10 }),
    ).rejects.toThrow()
  })

  it('registra a cotação quando o fornecedor é válido', async () => {
    mockPrisma.insumo.findFirst.mockResolvedValue({ id: 'insumo_1', name: 'Chocolate' })
    mockPrisma.contact.findFirst.mockResolvedValue({ id: 'c1' })
    mockPrisma.insumoPrice.create.mockResolvedValue({
      id: 'price_1',
      insumoId: 'insumo_1',
      contactId: 'c1',
      price: 10,
      contact: { id: 'c1', name: 'Fornecedor A' },
    })

    const result = await insumoService.addPrice('org_1', 'insumo_1', { contactId: 'c1', price: 10 })

    expect(mockPrisma.insumoPrice.create).toHaveBeenCalledOnce()
    expect(result.id).toBe('price_1')
  })
})

describe('InsumoService.delete', () => {
  it('lança erro quando o insumo não existe na organização', async () => {
    mockPrisma.insumo.findFirst.mockResolvedValue(null)

    await expect(insumoService.delete('org_1', 'insumo_inexistente')).rejects.toThrow()
  })
})
