import crypto from 'crypto'
import { prisma } from '../config/prisma'
import { OrderOrigin, OrderPaymentMethod, OrderPaymentStatus, OrderStatus, OrderType, OrgRole } from '@prisma/client'
import { OrderService } from './OrderService'

const orderService = new OrderService()

interface MercadoPagoPayer {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
}

export interface MercadoPagoPayment {
  id: number | string
  status: string
  transaction_amount: number
  payer?: MercadoPagoPayer
}

export class MercadoPagoService {
  // Confere a autenticidade do webhook: monta o template
  // "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" e calcula o
  // HMAC-SHA256 com o secret da organização, comparando em tempo
  // constante com o hash "v1" do cabeçalho x-signature (formato
  // "ts=<timestamp>,v1=<hash>"). Ver documentação oficial do Mercado
  // Pago (notifications/webhooks) — não depende do corpo bruto da
  // requisição, diferente do Stripe.
  verifyWebhookSignature(params: {
    secret: string
    xSignature: string
    xRequestId: string | undefined
    dataId: string
  }): boolean {
    const parsed = new Map(
      params.xSignature.split(',').map((part) => {
        const [key, value] = part.split('=')
        return [key?.trim(), value?.trim()] as [string, string]
      }),
    )
    const ts = parsed.get('ts')
    const hash = parsed.get('v1')
    if (!ts || !hash) return false

    const requestIdPart = params.xRequestId ? `request-id:${params.xRequestId};` : ''
    const template = `id:${params.dataId.toLowerCase()};${requestIdPart}ts:${ts};`
    const expected = crypto.createHmac('sha256', params.secret).update(template).digest('hex')

    const expectedBuffer = Buffer.from(expected, 'hex')
    const actualBuffer = Buffer.from(hash, 'hex')
    if (expectedBuffer.length !== actualBuffer.length) return false

    return crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  }

  async getPayment(accessToken: string, paymentId: string): Promise<MercadoPagoPayment> {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      throw new Error(`Mercado Pago respondeu ${response.status} ao buscar o pagamento ${paymentId}`)
    }

    return (await response.json()) as MercadoPagoPayment
  }

  // Cria o pedido automático a partir de um pagamento aprovado —
  // idempotente (não duplica se o Mercado Pago reenviar a mesma
  // notificação, já que mercadoPagoPaymentId é @unique em Order).
  async handleApprovedPayment(organizationId: string, payment: MercadoPagoPayment): Promise<void> {
    const paymentId = String(payment.id)

    const existing = await prisma.order.findUnique({ where: { mercadoPagoPaymentId: paymentId } })
    if (existing) return

    const owner = await prisma.user.findFirst({
      where: { organizationId, orgRole: OrgRole.OWNER },
      select: { id: true },
    })
    if (!owner) {
      console.error(`Pedido automático do Mercado Pago ignorado — organização ${organizationId} sem dono (OWNER).`)
      return
    }

    const payerName = [payment.payer?.first_name, payment.payer?.last_name]
      .filter((part): part is string => !!part)
      .join(' ')
      .trim()

    await orderService.create(organizationId, owner.id, {
      customerName: payerName || 'Cliente via Pix',
      type: OrderType.PICKUP,
      status: OrderStatus.DELIVERED,
      origin: OrderOrigin.MERCADO_PAGO,
      paymentMethod: OrderPaymentMethod.PIX,
      paymentStatus: OrderPaymentStatus.PAID,
      needsItemReview: true,
      mercadoPagoPaymentId: paymentId,
      items: [
        {
          name: 'Venda via Pix — identificar itens',
          quantity: 1,
          unitPrice: Number(payment.transaction_amount),
        },
      ],
    })
  }
}
