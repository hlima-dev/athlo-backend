import { Request, Response } from 'express'
import { StripeService } from '../services/StripeService'

const stripeService = new StripeService()

export class StripeWebhookController {
  async handle(req: Request, res: Response): Promise<void> {
    const signature = req.headers['stripe-signature']

    if (!signature || typeof signature !== 'string') {
      res.status(400).json({ status: 'error', message: 'Assinatura do webhook ausente' })
      return
    }

    let event
    try {
      // req.body é o Buffer bruto — ver middleware express.raw() em app.ts,
      // necessário para a verificação de assinatura do Stripe.
      event = stripeService.constructWebhookEvent(req.body as Buffer, signature)
    } catch (err) {
      console.error('Webhook do Stripe com assinatura inválida:', err)
      res.status(400).json({ status: 'error', message: 'Assinatura inválida' })
      return
    }

    try {
      await stripeService.handleWebhookEvent(event)
    } catch (err) {
      console.error('Erro ao processar webhook do Stripe:', err)
      // Responde 200 mesmo assim para o Stripe não ficar re-tentando um
      // evento que falhou por um motivo que não vai se resolver sozinho;
      // o erro já foi logado para investigação.
    }

    res.status(200).json({ received: true })
  }
}
