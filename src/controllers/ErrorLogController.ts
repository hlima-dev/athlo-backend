import { Request, Response } from 'express'

import { ErrorLogService } from '../services/ErrorLogService'
import { getPagination, successResponse } from '../utils/pagination'

const errorLogService = new ErrorLogService()

export class ErrorLogController {
  async list(req: Request, res: Response): Promise<void> {
    const pagination = getPagination(req)
    const filter = {
      resolved:
        req.query.resolved === 'true' ? true : req.query.resolved === 'false' ? false : undefined,
      search: req.query.search as string | undefined,
    }

    const result = await errorLogService.list(filter, pagination)
    res.status(200).json(successResponse(result))
  }

  async summary(_req: Request, res: Response): Promise<void> {
    const unresolvedCount = await errorLogService.unresolvedCount()
    res.status(200).json(successResponse({ unresolvedCount }))
  }

  async resolve(req: Request, res: Response): Promise<void> {
    const log = await errorLogService.resolve(String(req.params.id))
    res.status(200).json(successResponse(log, 'Marcado como resolvido'))
  }
}
