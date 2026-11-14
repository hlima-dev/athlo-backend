import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OrderService } from '../src/services/OrderService'
import { OrderPaymentStatus, OrderStatus } from '@prisma/client'

const mockPrisma = vi.hoisted(() => {
  const client = {
    order: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), delete: vi.fn() },
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
