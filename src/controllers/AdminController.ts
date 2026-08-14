import { Request, Response } from 'express'
import { z } from 'zod'

import { AdminService } from '../services/AdminService'
import { getPagination, successResponse } from '../utils/pagination'

const adminService = new AdminService()

const suspendSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
})

export class AdminController {
  async listOrganizations(req: Request, res: Response): Promise<void> {
    const pagination = getPagination(req)
    const filter = {
      search: req.query.search as string | undefined,
      status: req.query.status as string | undefined,
    }

    const result = await adminService.listOrganizations(filter, pagination)
    res.status(200).json(successResponse(result))
  }

  async getOrganization(req: Request, res: Response): Promise<void> {
    const organization = await adminService.getOrganization(String(req.params.id))
    res.status(200).json(successResponse(organization))
  }

  async suspendOrganization(req: Request, res: Response): Promise<void> {
    const { status } = suspendSchema.parse(req.body)
    const organization = await adminService.suspendOrganization(String(req.params.id), status)
    res.status(200).json(successResponse(organization, 'Status atualizado'))
  }

  async overview(req: Request, res: Response): Promise<void> {
    const overview = await adminService.overview()
    res.status(200).json(successResponse(overview))
  }
}
