import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OrderService } from '../src/services/OrderService'
import { OrderPaymentStatus, OrderStatus } from '@prisma/client'

const mockPrisma = vi.hoisted(() => {
  const client = {
    order: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    orderItem: { deleteMany: vi.fn() },
    invoice: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    contact: { findFirst: vi.fn() },
    product: { findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn() as (fn: (tx: unknown) => unknown) => unknown,
  }
  client.$transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(client))
  return client
})

vi.mock('../src/config/prisma', () => ({ prisma: mockPrisma }))
vi.mock('../src/services/EmailService', () => ({
  EmailService: class {
    sendOrderStatusUpdate = vi.fn()
  },
}))
vi.mock('../src/services/AuditLogService', () => ({
  AuditLogService: class {
    record = vi.fn()
  },
}))

const orderService = new OrderService()

const baseOrder = {
  id: 'order_1',
  organizationId: 'org_1',
  customerName: 'Cliente Teste',
  contactId: null,
  contact: null,
  total: 150,
  status: OrderStatus.CREATED,
  paymentStatus: OrderPaymentStatus.PENDING,
  items: [],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('OrderService.updateStatus — geração automática de fatura', () => {
  it('cria a fatura quando o pedido muda pra DELIVERED (vira pago)', async () => {
    mockPrisma.order.findFirst.mockResolvedValue(baseOrder)
    mockPrisma.order.update.mockResolvedValue({
      ...baseOrder,
      status: OrderStatus.DELIVERED,
      paymentStatus: OrderPaymentStatus.PAID,
    })
    mockPrisma.invoice.findUnique.mockResolvedValue(null)
    mockPrisma.invoice.create.mockResolvedValue({ id: 'invoice_1' })

    await orderService.updateStatus('org_1', 'order_1', OrderStatus.DELIVERED, 'user_1')

    expect(mockPrisma.invoice.findUnique).toHaveBeenCalledWith({ where: { orderId: 'order_1' } })
    expect(mockPrisma.invoice.create).toHaveBeenCalledOnce()

    const createCall = mockPrisma.invoice.create.mock.calls[0][0]
    expect(createCall.data).toMatchObject({
      type: 'RECEIVABLE',
      status: 'PAID',
      orderId: 'order_1',
      amount: 150,
    })
  })

  it('não cria fatura duplicada se já existe uma pro pedido', async () => {
    mockPrisma.order.findFirst.mockResolvedValue(baseOrder)
    mockPrisma.order.update.mockResolvedValue({
      ...baseOrder,
      status: OrderStatus.DELIVERED,
      paymentStatus: OrderPaymentStatus.PAID,
    })
    mockPrisma.invoice.findUnique.mockResolvedValue({ id: 'existing_invoice' })

    await orderService.updateStatus('org_1', 'order_1', OrderStatus.DELIVERED, 'user_1')

    expect(mockPrisma.invoice.create).not.toHaveBeenCalled()
  })

  it('não cria fatura quando o pedido não vira pago', async () => {
    mockPrisma.order.findFirst.mockResolvedValue(baseOrder)
    mockPrisma.order.update.mockResolvedValue({ ...baseOrder, status: OrderStatus.CONFIRMED })

    await orderService.updateStatus('org_1', 'order_1', OrderStatus.CONFIRMED, 'user_1')

    expect(mockPrisma.invoice.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled()
  })

  it('não cria fatura sem um usuário logado associado à ação', async () => {
    mockPrisma.order.findFirst.mockResolvedValue(baseOrder)
    mockPrisma.order.update.mockResolvedValue({
      ...baseOrder,
      status: OrderStatus.DELIVERED,
      paymentStatus: OrderPaymentStatus.PAID,
    })

    await orderService.updateStatus('org_1', 'order_1', OrderStatus.DELIVERED, undefined)

    expect(mockPrisma.invoice.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled()
  })
})

describe('OrderService — baixa automática de estoque', () => {
  it('debita o estoque do produto rastreado ao criar um pedido', async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null)
    mockPrisma.product.findMany.mockResolvedValue([{ id: 'prod_1', name: 'Caneca', stockQty: 10 }])
    mockPrisma.order.create.mockResolvedValue({ ...baseOrder, items: [{ productId: 'prod_1', quantity: 3 }] })

    await orderService.create('org_1', 'user_1', {
      customerName: 'Cliente Teste',
      items: [{ productId: 'prod_1', name: 'Caneca', quantity: 3, unitPrice: 10 }],
    })

    expect(mockPrisma.product.update).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: { stockQty: { increment: -3 } },
    })
  })

  it('não deixa criar pedido se o estoque do produto for insuficiente', async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null)
    mockPrisma.product.findMany.mockResolvedValue([{ id: 'prod_1', name: 'Caneca', stockQty: 2 }])

    await expect(
      orderService.create('org_1', 'user_1', {
        customerName: 'Cliente Teste',
        items: [{ productId: 'prod_1', name: 'Caneca', quantity: 5, unitPrice: 10 }],
      }),
    ).rejects.toThrow('Estoque insuficiente')

    expect(mockPrisma.order.create).not.toHaveBeenCalled()
    expect(mockPrisma.product.update).not.toHaveBeenCalled()
  })

  it('ignora produto sem estoque rastreado (stockQty nulo)', async () => {
    mockPrisma.contact.findFirst.mockResolvedValue(null)
    mockPrisma.product.findMany.mockResolvedValue([])
    mockPrisma.order.create.mockResolvedValue({ ...baseOrder, items: [{ productId: 'prod_1', quantity: 3 }] })

    await orderService.create('org_1', 'user_1', {
      customerName: 'Cliente Teste',
      items: [{ productId: 'prod_1', name: 'Caneca', quantity: 3, unitPrice: 10 }],
    })

    expect(mockPrisma.product.update).not.toHaveBeenCalled()
  })

  it('devolve o estoque reservado quando o pedido é cancelado', async () => {
    const orderWithItems = { ...baseOrder, items: [{ productId: 'prod_1', quantity: 4 }] }
    mockPrisma.order.findFirst.mockResolvedValue(orderWithItems)
    mockPrisma.product.findMany.mockResolvedValue([{ id: 'prod_1', name: 'Caneca', stockQty: 6 }])
    mockPrisma.order.update.mockResolvedValue({ ...orderWithItems, status: OrderStatus.CANCELED })

    await orderService.updateStatus('org_1', 'order_1', OrderStatus.CANCELED, 'user_1')

    expect(mockPrisma.product.update).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: { stockQty: { increment: 4 } },
    })
  })

  it('reserva o estoque de novo quando um pedido cancelado volta a ficar ativo', async () => {
    const canceledOrder = { ...baseOrder, status: OrderStatus.CANCELED, items: [{ productId: 'prod_1', quantity: 2 }] }
    mockPrisma.order.findFirst.mockResolvedValue(canceledOrder)
    mockPrisma.product.findMany.mockResolvedValue([{ id: 'prod_1', name: 'Caneca', stockQty: 6 }])
    mockPrisma.order.update.mockResolvedValue({ ...canceledOrder, status: OrderStatus.CONFIRMED })

    await orderService.updateStatus('org_1', 'order_1', OrderStatus.CONFIRMED, 'user_1')

    expect(mockPrisma.product.update).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: { stockQty: { increment: -2 } },
    })
  })

  it('devolve o estoque reservado ao excluir um pedido não cancelado', async () => {
    const orderWithItems = { ...baseOrder, items: [{ productId: 'prod_1', quantity: 5 }] }
    mockPrisma.order.findFirst.mockResolvedValue(orderWithItems)
    mockPrisma.product.findMany.mockResolvedValue([{ id: 'prod_1', name: 'Caneca', stockQty: 1 }])

    await orderService.delete('org_1', 'order_1', 'user_1')

    expect(mockPrisma.product.update).toHaveBeenCalledWith({
      where: { id: 'prod_1' },
      data: { stockQty: { increment: 5 } },
    })
  })
})

describe('OrderService.findById — lucro estimado por item', () => {
  it('retorna estimatedProfit nulo quando o produto não tem ficha técnica', async () => {
    mockPrisma.order.findFirst.mockResolvedValue({
      ...baseOrder,
      items: [
        {
          id: 'item_1',
          quantity: 2,
          unitPrice: 10,
          product: { id: 'prod_1', name: 'Caneca', taxPercent: null, paymentFeePercent: null, shippingCost: null, recipeItems: [] },
        },
      ],
    })

    const result = await orderService.findById('org_1', 'order_1')

    expect(result.items[0].estimatedProfit).toBeNull()
    expect(result.items[0].product).toEqual({ id: 'prod_1', name: 'Caneca' })
  })

  it('calcula o lucro usando o preço efetivamente cobrado no pedido, não o preço de catálogo', async () => {
    mockPrisma.order.findFirst.mockResolvedValue({
      ...baseOrder,
      items: [
        {
          id: 'item_1',
          quantity: 3,
          unitPrice: 8, // vendido com desconto em relação ao catálogo
          product: {
            id: 'prod_1',
            name: 'Brigadeiro',
            taxPercent: null,
            paymentFeePercent: null,
            shippingCost: null,
            recipeItems: [
              {
                id: 'ri_1',
                insumoId: 'insumo_1',
                quantity: 1,
                insumo: {
                  name: 'Chocolate',
                  unit: 'kg',
                  prices: [
                    { contactId: 'c1', price: 2, isPromo: false, validUntil: null, recordedAt: new Date(), contact: { id: 'c1', name: 'Fornecedor A' } },
                  ],
                },
              },
            ],
          },
        },
      ],
    })

    const result = await orderService.findById('org_1', 'order_1')

    // margem por unidade = 8 (preço vendido) - 2 (custo) = 6; × 3 unidades = 18
    expect(result.items[0].estimatedProfit).toBe(18)
  })
})

describe('OrderService.update — needsItemReview', () => {
  it('zera needsItemReview ao editar os itens do pedido', async () => {
    mockPrisma.order.findFirst.mockResolvedValue({
      ...baseOrder,
      needsItemReview: true,
      items: [],
    })
    mockPrisma.order.update.mockResolvedValue({ ...baseOrder, needsItemReview: false })

    await orderService.update(
      'org_1',
      'order_1',
      { items: [{ name: 'Brigadeiro', quantity: 2, unitPrice: 5 }] },
      'user_1',
    )

    const updateCall = mockPrisma.order.update.mock.calls[0][0]
    expect(updateCall.data.needsItemReview).toBe(false)
  })

  it('não mexe em needsItemReview quando os itens não são alterados', async () => {
    mockPrisma.order.findFirst.mockResolvedValue({ ...baseOrder, needsItemReview: true, items: [] })
    mockPrisma.order.update.mockResolvedValue(baseOrder)

    await orderService.update('org_1', 'order_1', { customerName: 'Novo nome' }, 'user_1')

    const updateCall = mockPrisma.order.update.mock.calls[0][0]
    expect(updateCall.data.needsItemReview).toBeUndefined()
  })
})

describe('OrderService.findAll — filtro needsReview', () => {
  it('aplica needsItemReview no where da listagem, mas o resumo "a identificar" ignora o filtro atual', async () => {
    mockPrisma.order.findMany.mockResolvedValue([])
    mockPrisma.order.count.mockResolvedValue(0)
    mockPrisma.order.aggregate.mockResolvedValue({ _sum: { total: 0 } })

    // Combina needsReview com outro filtro (status) pra distinguir a
    // contagem "total" (respeita todos os filtros) da contagem "a
    // identificar" do resumo (sempre org inteira, sem o filtro de status).
    await orderService.findAll(
      'org_1',
      { needsReview: true, status: OrderStatus.DELIVERED },
      { page: 1, limit: 20, skip: 0 },
    )

    const findManyCall = mockPrisma.order.findMany.mock.calls[0][0]
    expect(findManyCall.where.needsItemReview).toBe(true)
    expect(findManyCall.where.status).toBe(OrderStatus.DELIVERED)

    // Última chamada a order.count é a do resumo "a identificar" — sem o
    // filtro de status que foi passado pra listagem.
    const countCalls = mockPrisma.order.count.mock.calls
    const needsReviewSummaryCall = countCalls[countCalls.length - 1][0]
    expect(needsReviewSummaryCall).toEqual({ where: { organizationId: 'org_1', needsItemReview: true } })
  })
})
