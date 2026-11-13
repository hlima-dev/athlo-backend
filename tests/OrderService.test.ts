import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OrderService } from '../src/services/OrderService'
import { OrderPaymentStatus, OrderStatus } from '@prisma/client'

const mockPrisma = vi.hoisted(() => ({
  order: { findFirst: vi.fn(), update: vi.fn() },
  orderItem: { deleteMany: vi.fn() },
  invoice: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  contact: { findFirst: vi.fn() },
}))

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
