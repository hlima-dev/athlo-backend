import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProductService, calculateMargin, calculateProductionCost } from '../src/services/ProductService'

const mockPrisma = vi.hoisted(() => ({
  product: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  insumo: { count: vi.fn() },
  recipeItem: { deleteMany: vi.fn(), createMany: vi.fn() },
  $transaction: vi.fn() as (ops: unknown[]) => unknown,
}))

vi.mock('../src/config/prisma', () => ({ prisma: mockPrisma }))
vi.mock('../src/services/AuditLogService', () => ({
  AuditLogService: class {
    record = vi.fn()
  },
}))

const productService = new ProductService()

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.$transaction.mockImplementation((ops: unknown[]) => Promise.all(ops))
})

function makeRecipeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item_1',
    insumoId: 'insumo_1',
    quantity: 1,
    insumo: { name: 'Chocolate', unit: 'kg', prices: [] },
    ...overrides,
  }
}

describe('calculateProductionCost', () => {
  it('retorna 0 quando a receita está vazia', () => {
    expect(calculateProductionCost([])).toBe(0)
  })

  it('soma quantidade × melhor preço de cada insumo da receita', () => {
    const items = [
      makeRecipeItem({
        quantity: 2,
        insumo: {
          name: 'Chocolate',
          unit: 'kg',
          prices: [
            { contactId: 'c1', price: 10, isPromo: false, validUntil: null, recordedAt: new Date(), contact: { id: 'c1', name: 'A' } },
          ],
        },
      }),
      makeRecipeItem({
        insumoId: 'insumo_2',
        quantity: 3,
        insumo: {
          name: 'Leite condensado',
          unit: 'unidade',
          prices: [
            { contactId: 'c2', price: 5, isPromo: false, validUntil: null, recordedAt: new Date(), contact: { id: 'c2', name: 'B' } },
          ],
        },
      }),
    ]

    // 2 * 10 + 3 * 5 = 35
    expect(calculateProductionCost(items)).toBe(35)
  })

  it('trata insumo sem nenhuma cotação como custo 0 (não quebra)', () => {
    const items = [makeRecipeItem({ quantity: 5, insumo: { name: 'Chocolate', unit: 'kg', prices: [] } })]
    expect(calculateProductionCost(items)).toBe(0)
  })
})

describe('calculateMargin', () => {
  it('trata imposto/taxa/frete ausentes como 0', () => {
    const margin = calculateMargin({ price: 100, productionCost: 40 })
    expect(margin).toEqual({
      productionCost: 40,
      taxAmount: 0,
      paymentFeeAmount: 0,
      shippingCost: 0,
      netMargin: 60,
      netMarginPercent: 60,
    })
  })

  it('calcula a decomposição completa do preço', () => {
    const margin = calculateMargin({
      price: 100,
      productionCost: 30,
      taxPercent: 6,
      paymentFeePercent: 4,
      shippingCost: 5,
    })

    expect(margin.taxAmount).toBe(6)
    expect(margin.paymentFeeAmount).toBe(4)
    expect(margin.shippingCost).toBe(5)
    expect(margin.netMargin).toBe(55)
    expect(margin.netMarginPercent).toBeCloseTo(55)
  })

  it('não divide por zero quando o preço é 0', () => {
    const margin = calculateMargin({ price: 0, productionCost: 0 })
    expect(margin.netMarginPercent).toBe(0)
  })
})

describe('ProductService.updateRecipe', () => {
  it('rejeita insumo que não pertence à organização', async () => {
    mockPrisma.product.findFirst.mockResolvedValue({ id: 'product_1', name: 'Brigadeiro' })
    mockPrisma.insumo.count.mockResolvedValue(0)

    await expect(
      productService.updateRecipe('org_1', 'product_1', [{ insumoId: 'insumo_de_outra_org', quantity: 1 }]),
    ).rejects.toThrow()

    expect(mockPrisma.recipeItem.deleteMany).not.toHaveBeenCalled()
  })

  it('substitui a receita (delete + create) quando os insumos são válidos', async () => {
    mockPrisma.product.findFirst
      .mockResolvedValueOnce({ id: 'product_1', name: 'Brigadeiro' })
      .mockResolvedValueOnce({
        id: 'product_1',
        name: 'Brigadeiro',
        price: 5,
        taxPercent: null,
        paymentFeePercent: null,
        shippingCost: null,
        recipeItems: [],
      })
    mockPrisma.insumo.count.mockResolvedValue(1)

    await productService.updateRecipe('org_1', 'product_1', [{ insumoId: 'insumo_1', quantity: 2 }])

    expect(mockPrisma.recipeItem.deleteMany).toHaveBeenCalledWith({ where: { productId: 'product_1' } })
    expect(mockPrisma.recipeItem.createMany).toHaveBeenCalledWith({
      data: [{ productId: 'product_1', insumoId: 'insumo_1', quantity: 2 }],
    })
  })
})

describe('ProductService.findById — margem', () => {
  it('inclui receita e margem calculada na resposta', async () => {
    mockPrisma.product.findFirst.mockResolvedValue({
      id: 'product_1',
      name: 'Brigadeiro',
      price: 5,
      taxPercent: 6,
      paymentFeePercent: 4,
      shippingCost: 0.5,
      recipeItems: [
        makeRecipeItem({
          quantity: 1,
          insumo: {
            name: 'Chocolate',
            unit: 'kg',
            prices: [
              { contactId: 'c1', price: 2, isPromo: false, validUntil: null, recordedAt: new Date(), contact: { id: 'c1', name: 'Fornecedor A' } },
            ],
          },
        }),
      ],
    })

    const result = await productService.findById('org_1', 'product_1')

    expect(result.recipeItems[0]).toMatchObject({ insumoName: 'Chocolate', unitCost: 2 })
    expect(result.margin.productionCost).toBe(2)
    expect(result.margin.netMargin).toBeCloseTo(5 - 2 - 0.3 - 0.2 - 0.5)
  })
})
