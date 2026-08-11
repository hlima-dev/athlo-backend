import { Request, Response } from 'express'
import { z } from 'zod'

import { SubscriptionService } from '../services/SubscriptionService'
import { successResponse } from '../utils/pagination'

const subscriptionService = new SubscriptionService()

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
}
