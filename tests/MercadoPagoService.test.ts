import crypto from 'crypto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MercadoPagoService } from '../src/services/MercadoPagoService'

const mockPrisma = vi.hoisted(() => ({
  order: { findUnique: vi.fn() },
  user: { findFirst: vi.fn() },
}))

const mockOrderServiceCreate = vi.hoisted(() => vi.fn())

vi.mock('../src/config/prisma', () => ({ prisma: mockPrisma }))
vi.mock('../src/services/OrderService', () => ({
  OrderService: class {
    create = mockOrderServiceCreate
  },
}))

const mercadoPagoService = new MercadoPagoService()

beforeEach(() => {
  vi.clearAllMocks()
})

function sign(secret: string, dataId: string, requestId: string, ts: string) {
  const template = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`
  return crypto.createHmac('sha256', secret).update(template).digest('hex')
}

describe('MercadoPagoService.verifyWebhookSignature', () => {
  it('aceita uma assinatura calculada corretamente', () => {
    const secret = 'segredo-de-teste'
    const ts = '1700000000'
    const hash = sign(secret, '123456', 'req-1', ts)

    const result = mercadoPagoService.verifyWebhookSignature({
      secret,
      xSignature: `ts=${ts},v1=${hash}`,
      xRequestId: 'req-1',
      dataId: '123456',
    })

    expect(result).toBe(true)
  })

  it('rejeita quando o hash não bate (secret errado)', () => {
    const ts = '1700000000'
    const hash = sign('segredo-correto', '123456', 'req-1', ts)

    const result = mercadoPagoService.verifyWebhookSignature({
      secret: 'segredo-errado',
      xSignature: `ts=${ts},v1=${hash}`,
      xRequestId: 'req-1',
      dataId: '123456',
    })

    expect(result).toBe(false)
  })

  it('rejeita quando o data.id foi adulterado', () => {
    const secret = 'segredo-de-teste'
    const ts = '1700000000'
    const hash = sign(secret, '123456', 'req-1', ts)

    const result = mercadoPagoService.verifyWebhookSignature({
      secret,
      xSignature: `ts=${ts},v1=${hash}`,
      xRequestId: 'req-1',
      dataId: '999999', // tentando reaproveitar a assinatura pra outro pagamento
    })

    expect(result).toBe(false)
  })

  it('rejeita cabeçalho x-signature malformado (sem ts ou v1)', () => {
    const result = mercadoPagoService.verifyWebhookSignature({
      secret: 'segredo-de-teste',
      xSignature: 'formato-invalido',
      xRequestId: 'req-1',
      dataId: '123456',
    })

    expect(result).toBe(false)
  })
})

describe('MercadoPagoService.handleApprovedPayment', () => {
  it('não cria pedido duplicado para o mesmo mercadoPagoPaymentId', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ id: 'order_existente' })

    await mercadoPagoService.handleApprovedPayment('org_1', {
      id: 'pay_1',
      status: 'approved',
      transaction_amount: 50,
    })

    expect(mockOrderServiceCreate).not.toHaveBeenCalled()
  })

  it('ignora o pagamento se a organização não tem nenhum OWNER', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null)
    mockPrisma.user.findFirst.mockResolvedValue(null)

    await mercadoPagoService.handleApprovedPayment('org_1', {
      id: 'pay_1',
      status: 'approved',
      transaction_amount: 50,
    })

    expect(mockOrderServiceCreate).not.toHaveBeenCalled()
  })

  it('cria o pedido com item placeholder e needsItemReview true', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null)
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'owner_1' })

    await mercadoPagoService.handleApprovedPayment('org_1', {
      id: 'pay_1',
      status: 'approved',
      transaction_amount: 45.9,
      payer: { first_name: 'Maria', last_name: 'Silva' },
    })

    expect(mockOrderServiceCreate).toHaveBeenCalledWith(
      'org_1',
      'owner_1',
      expect.objectContaining({
        customerName: 'Maria Silva',
        paymentStatus: 'PAID',
        origin: 'MERCADO_PAGO',
        needsItemReview: true,
        mercadoPagoPaymentId: 'pay_1',
        items: [expect.objectContaining({ unitPrice: 45.9, quantity: 1 })],
      }),
    )
  })

  it('usa "Cliente via Pix" quando o pagador não tem nome', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null)
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'owner_1' })

    await mercadoPagoService.handleApprovedPayment('org_1', {
      id: 'pay_2',
      status: 'approved',
      transaction_amount: 20,
    })

    expect(mockOrderServiceCreate).toHaveBeenCalledWith(
      'org_1',
      'owner_1',
      expect.objectContaining({ customerName: 'Cliente via Pix' }),
    )
  })
})
