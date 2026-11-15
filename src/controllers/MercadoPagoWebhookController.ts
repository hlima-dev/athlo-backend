import { Request, Response } from 'express'
import { prisma } from '../config/prisma'
import { MercadoPagoService } from '../services/MercadoPagoService'

const mercadoPagoService = new MercadoPagoService()

export class MercadoPagoWebhookController {
  async handle(req: Request, res: Response): Promise<void> {
    const organizationId = String(req.params.organizationId)
    const type = (req.query.type ?? req.query.topic ?? req.body?.type) as string | undefined
    const dataId = (req.query['data.id'] ?? req.body?.data?.id) as string | undefined

    // Mercado Pago manda notificação de vários tópicos na mesma URL
    // (merchant_order, chargebacks...) se a conta estiver configurada de
    // forma ampla — só nos importa "payment".
    if (type !== 'payment' || !dataId) {
      res.status(200).json({ received: true })
      return
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { mercadoPagoAccessToken: true, mercadoPagoWebhookSecret: true },
    })

    if (!organization?.mercadoPagoAccessToken || !organization.mercadoPagoWebhookSecret) {
      res.status(404).json({ status: 'error', message: 'Organização sem integração Mercado Pago configurada' })
      return
    }

    const signature = req.headers['x-signature']
    if (!signature || typeof signature !== 'string') {
      res.status(400).json({ status: 'error', message: 'Assinatura do webhook ausente' })
      return
    }

    const requestId = req.headers['x-request-id']
    const isValid = mercadoPagoService.verifyWebhookSignature({
      secret: organization.mercadoPagoWebhookSecret,
      xSignature: signature,
      xRequestId: typeof requestId === 'string' ? requestId : undefined,
      dataId: String(dataId),
    })

    if (!isValid) {
      console.error(`Webhook do Mercado Pago com assinatura inválida (organização ${organizationId})`)
      res.status(400).json({ status: 'error', message: 'Assinatura inválida' })
      return
    }

    try {
      const payment = await mercadoPagoService.getPayment(organization.mercadoPagoAccessToken, String(dataId))
      if (payment.status === 'approved') {
        await mercadoPagoService.handleApprovedPayment(organizationId, payment)
      }
    } catch (err) {
      console.error('Erro ao processar webhook do Mercado Pago:', err)
      // Responde 200 mesmo assim para o Mercado Pago não ficar re-tentando
      // um evento que falhou por um motivo que não vai se resolver
      // sozinho — mesmo princípio já usado no webhook do Stripe.
    }

    res.status(200).json({ received: true })
  }
}
