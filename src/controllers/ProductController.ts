import { Request, Response } from 'express'
import { z } from 'zod'

import { ProductService } from '../services/ProductService'
import { getPagination, successResponse } from '../utils/pagination'
import { ProductType } from '@prisma/client'

const productService = new ProductService()

const createProductSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  sku: z.string().optional(),
  type: z.nativeEnum(ProductType).optional(),
  price: z.number().nonnegative(),
  active: z.boolean().optional(),
})

const updateProductSchema = createProductSchema.partial()

export class ProductController {
  async create(req: Request, res: Response): Promise<void> {
    const data = createProductSchema.parse(req.body)
    const product = await productService.create(req.user!.organizationId, data)
    res.status(201).json(successResponse(product, 'Produto cadastrado com sucesso'))
  }

  async list(req: Request, res: Response): Promise<void> {
    const pagination = getPagination(req)

    const filter = {
      type: req.query.type as ProductType | undefined,
      active: req.query.active !== undefined ? req.query.active === 'true' : undefined,
      search: req.query.search as string | undefined,
    }

    const result = await productService.findAll(req.user!.organizationId, filter, pagination)
    res.status(200).json(successResponse(result))
  }

  async getById(req: Request, res: Response): Promise<void> {
    const product = await productService.findById(req.user!.organizationId, String(req.params.id))
    res.status(200).json(successResponse(product))
  }

  async update(req: Request, res: Response): Promise<void> {
    const data = updateProductSchema.parse(req.body)
    const product = await productService.update(req.user!.organizationId, String(req.params.id), data)
    res.status(200).json(successResponse(product, 'Produto atualizado com sucesso'))
  }

  async delete(req: Request, res: Response): Promise<void> {
    await productService.delete(req.user!.organizationId, String(req.params.id))
    res.status(204).send()
  }
}
