import { Request, Response } from 'express'
import { z } from 'zod'

import { OrderService } from '../services/OrderService'
import { getPagination, successResponse } from '../utils/pagination'
import {
  OrderOrigin,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
  OrderType,
} from '@prisma/client'

const orderService = new OrderService()

const orderItemSchema = z.object({
  productId: z.string().optional(),
  name: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().nonnegative(),
})

const createOrderSchema = z.object({
  contactId: z.string().optional(),
  customerName: z.string().min(2, 'Informe o nome do cliente'),
  customerPhone: z.string().optional(),
  type: z.nativeEnum(OrderType).optional(),
  status: z.nativeEnum(OrderStatus).optional(),
  origin: z.nativeEnum(OrderOrigin).optional(),
  paymentMethod: z.nativeEnum(OrderPaymentMethod).optional(),
  paymentStatus: z.nativeEnum(OrderPaymentStatus).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  notes: z.string().optional(),
  scheduledAt: z.coerce.date().optional(),
  items: z.array(orderItemSchema).min(1, 'Adicione ao menos um item ao pedido'),
})

const updateOrderSchema = createOrderSchema.partial().extend({
  items: z.array(orderItemSchema).optional(),
})

const updateStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
})

export class OrderController {
  async create(req: Request, res: Response): Promise<void> {
    const data = createOrderSchema.parse(req.body)
    const order = await orderService.create(req.user!.organizationId, req.user!.id, data)
    res.status(201).json(successResponse(order, 'Pedido criado com sucesso'))
  }

  async list(req: Request, res: Response): Promise<void> {
    const pagination = getPagination(req)

    const filter = {
      status: req.query.status as OrderStatus | undefined,
      type: req.query.type as OrderType | undefined,
      origin: req.query.origin as OrderOrigin | undefined,
      search: req.query.search as string | undefined,
      from: req.query.from ? new Date(String(req.query.from)) : undefined,
      to: req.query.to ? new Date(String(req.query.to)) : undefined,
    }

    const result = await orderService.findAll(req.user!.organizationId, filter, pagination)
    res.status(200).json(successResponse(result))
  }

  async getById(req: Request, res: Response): Promise<void> {
    const order = await orderService.findById(req.user!.organizationId, String(req.params.id))
    res.status(200).json(successResponse(order))
  }

  async update(req: Request, res: Response): Promise<void> {
    const data = updateOrderSchema.parse(req.body)
    const order = await orderService.update(req.user!.organizationId, String(req.params.id), data)
    res.status(200).json(successResponse(order, 'Pedido atualizado com sucesso'))
  }

  async updateStatus(req: Request, res: Response): Promise<void> {
    const { status } = updateStatusSchema.parse(req.body)
    const order = await orderService.updateStatus(req.user!.organizationId, String(req.params.id), status)
    res.status(200).json(successResponse(order, 'Status do pedido atualizado'))
  }

  async delete(req: Request, res: Response): Promise<void> {
    await orderService.delete(req.user!.organizationId, String(req.params.id))
    res.status(204).send()
  }
}
