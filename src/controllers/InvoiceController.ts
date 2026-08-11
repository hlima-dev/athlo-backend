import { Request, Response } from 'express'
import { z } from 'zod'

import { InvoiceService } from '../services/InvoiceService'
import { getPagination, successResponse } from '../utils/pagination'
import { InvoiceMethod, InvoiceStatus, InvoiceType } from '@prisma/client'

const invoiceService = new InvoiceService()

const createInvoiceSchema = z.object({
  type: z.nativeEnum(InvoiceType).optional(),
  description: z.string().min(2),
  amount: z.number().positive('Valor deve ser positivo'),
  dueDate: z.coerce.date(),
  status: z.nativeEnum(InvoiceStatus).optional(),
  method: z.nativeEnum(InvoiceMethod).optional(),
  notes: z.string().optional(),
  contactId: z.string().optional(),
})

const updateInvoiceSchema = createInvoiceSchema.partial()

const markPaidSchema = z.object({
  method: z.nativeEnum(InvoiceMethod).optional(),
})

export class InvoiceController {
  async create(req: Request, res: Response): Promise<void> {
    const data = createInvoiceSchema.parse(req.body)
    const invoice = await invoiceService.create(req.user!.organizationId, req.user!.id, data)
    res.status(201).json(successResponse(invoice, 'Fatura criada com sucesso'))
  }

  async list(req: Request, res: Response): Promise<void> {
    const pagination = getPagination(req)

    const filter = {
      type: req.query.type as InvoiceType | undefined,
      status: req.query.status as InvoiceStatus | undefined,
      contactId: req.query.contactId as string | undefined,
      search: req.query.search as string | undefined,
    }

    const result = await invoiceService.findAll(req.user!.organizationId, filter, pagination)
    res.status(200).json(successResponse(result))
  }

  async getById(req: Request, res: Response): Promise<void> {
    const invoice = await invoiceService.findById(req.user!.organizationId, String(req.params.id))
    res.status(200).json(successResponse(invoice))
  }

  async update(req: Request, res: Response): Promise<void> {
    const data = updateInvoiceSchema.parse(req.body)
    const invoice = await invoiceService.update(req.user!.organizationId, String(req.params.id), data)
    res.status(200).json(successResponse(invoice, 'Fatura atualizada com sucesso'))
  }

  async markPaid(req: Request, res: Response): Promise<void> {
    const { method } = markPaidSchema.parse(req.body)
    const invoice = await invoiceService.markPaid(req.user!.organizationId, String(req.params.id), method)
    res.status(200).json(successResponse(invoice, 'Fatura marcada como paga'))
  }

  async delete(req: Request, res: Response): Promise<void> {
    await invoiceService.delete(req.user!.organizationId, String(req.params.id))
    res.status(204).send()
  }
}
