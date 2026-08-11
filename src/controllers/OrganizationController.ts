import { Request, Response } from 'express'
import { z } from 'zod'

import { OrganizationService } from '../services/OrganizationService'
import { successResponse } from '../utils/pagination'

const organizationService = new OrganizationService()

const updateOrganizationSchema = z.object({
  name: z.string().min(2).optional(),
  document: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  logoUrl: z.string().url().optional(),
})

export class OrganizationController {
  async me(req: Request, res: Response): Promise<void> {
    const organization = await organizationService.findById(req.user!.organizationId)
    res.status(200).json(successResponse(organization))
  }

  async update(req: Request, res: Response): Promise<void> {
    const data = updateOrganizationSchema.parse(req.body)
    const organization = await organizationService.update(req.user!.organizationId, data)
    res.status(200).json(successResponse(organization, 'Empresa atualizada com sucesso'))
  }

  async members(req: Request, res: Response): Promise<void> {
    const members = await organizationService.listMembers(req.user!.organizationId)
    res.status(200).json(successResponse(members))
  }
}
