import { Request, Response } from 'express'
import { prisma } from '../config/prisma'
import { successResponse } from '../utils/pagination'

export class PlanController {
  async list(_req: Request, res: Response): Promise<void> {
    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: 'asc' },
    })
    res.status(200).json(successResponse(plans))
  }
}
