import { Request, Response } from 'express'
import { z } from 'zod'

import { SubscriptionService } from '../services/SubscriptionService'
import { StripeService } from '../services/StripeService'
import { successResponse } from '../utils/pagination'

const subscriptionService = new SubscriptionService()
const stripeService = new StripeService()

const changePlanSchema = z.object({
  planSlug: z.string().min(1),
})

export class SubscriptionController {
  async current(req: Request, res: Response): Promise<void> {
    const subscription = await subscriptionService.findByOrganization(req.user!.organizationId)
    res.status(200).json(successResponse(subscription))
  }

  async changePlan(req: Request, res: Response): Promise<void> {
    const { planSlug } = changePlanSchema.parse(req.body)
    const subscription = await subscriptionService.changePlan(req.user!.organizationId, planSlug)
    res.status(200).json(successResponse(subscription, 'Plano atualizado com sucesso'))
  }

  async cancel(req: Request, res: Response): Promise<void> {
    const subscription = await subscriptionService.cancel(req.user!.organizationId)
    res.status(200).json(successResponse(subscription, 'Assinatura cancelada'))
  }

  async checkout(req: Request, res: Response): Promise<void> {
    const { planSlug } = changePlanSchema.parse(req.body)
    const result = await stripeService.createCheckoutSession(
      req.user!.organizationId,
      req.user!.id,
      planSlug,
    )
    res.status(200).json(successResponse(result))
  }

  async portal(req: Request, res: Response): Promise<void> {
    const result = await stripeService.createPortalSession(req.user!.organizationId)
    res.status(200).json(successResponse(result))
  }
}
