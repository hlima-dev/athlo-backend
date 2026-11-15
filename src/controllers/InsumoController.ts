import { Request, Response } from 'express'
import { z } from 'zod'

import { InsumoService } from '../services/InsumoService'
import { getPagination, successResponse } from '../utils/pagination'

const insumoService = new InsumoService()

const createInsumoSchema = z.object({
  name: z.string().min(2),
  unit: z.string().min(1),
  active: z.boolean().optional(),
})

const updateInsumoSchema = createInsumoSchema.partial()

const addInsumoPriceSchema = z.object({
  contactId: z.string().min(1),
  price: z.number().nonnegative(),
  isPromo: z.boolean().optional(),
  validUntil: z.coerce.date().optional(),
})

export class InsumoController {
  async create(req: Request, res: Response): Promise<void> {
    const data = createInsumoSchema.parse(req.body)
    const insumo = await insumoService.create(req.user!.organizationId, data, req.user!.id)
    res.status(201).json(successResponse(insumo, 'Insumo cadastrado com sucesso'))
  }

  async list(req: Request, res: Response): Promise<void> {
    const pagination = getPagination(req)

    const filter = {
      active: req.query.active !== undefined ? req.query.active === 'true' : undefined,
      search: req.query.search as string | undefined,
    }

    const result = await insumoService.findAll(req.user!.organizationId, filter, pagination)
    res.status(200).json(successResponse(result))
  }

  async getById(req: Request, res: Response): Promise<void> {
    const insumo = await insumoService.findById(req.user!.organizationId, String(req.params.id))
    res.status(200).json(successResponse(insumo))
  }

  async update(req: Request, res: Response): Promise<void> {
    const data = updateInsumoSchema.parse(req.body)
    const insumo = await insumoService.update(req.user!.organizationId, String(req.params.id), data, req.user!.id)
    res.status(200).json(successResponse(insumo, 'Insumo atualizado com sucesso'))
  }

  async delete(req: Request, res: Response): Promise<void> {
    await insumoService.delete(req.user!.organizationId, String(req.params.id), req.user!.id)
    res.status(204).send()
  }

  async addPrice(req: Request, res: Response): Promise<void> {
    const data = addInsumoPriceSchema.parse(req.body)
    const price = await insumoService.addPrice(req.user!.organizationId, String(req.params.id), data, req.user!.id)
    res.status(201).json(successResponse(price, 'Cotação registrada com sucesso'))
  }

  async listPrices(req: Request, res: Response): Promise<void> {
    const prices = await insumoService.listPrices(req.user!.organizationId, String(req.params.id))
    res.status(200).json(successResponse(prices))
  }
}
