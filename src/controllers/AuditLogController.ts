import { Request, Response } from 'express'

import { AuditLogService } from '../services/AuditLogService'
import { getPagination, successResponse } from '../utils/pagination'

const auditLogService = new AuditLogService()

export class AuditLogController {
  async list(req: Request, res: Response): Promise<void> {
    const pagination = getPagination(req)
    const filter = {
      entityType: req.query.entityType as string | undefined,
      search: req.query.search as string | undefined,
    }

    const result = await auditLogService.list(req.user!.organizationId, filter, pagination)
    res.status(200).json(successResponse(result))
  }
}
