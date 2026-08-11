import { Request, Response } from 'express'
import { z } from 'zod'

import { ContactService } from '../services/ContactService'
import { getPagination, successResponse } from '../utils/pagination'
import { ContactStatus, ContactType } from '@prisma/client'

const contactService = new ContactService()

const createContactSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  document: z.string().optional(),
  company: z.string().optional(),
  type: z.nativeEnum(ContactType).optional(),
  status: z.nativeEnum(ContactStatus).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
})

const updateContactSchema = createContactSchema.partial()

export class ContactController {
  async create(req: Request, res: Response): Promise<void> {
    const data = createContactSchema.parse(req.body)
    const contact = await contactService.create(req.user!.organizationId, data)
    res.status(201).json(successResponse(contact, 'Contato cadastrado com sucesso'))
  }

  async list(req: Request, res: Response): Promise<void> {
    const pagination = getPagination(req)

    const filter = {
      type: req.query.type as ContactType | undefined,
      status: req.query.status as ContactStatus | undefined,
      search: req.query.search as string | undefined,
    }

    const result = await contactService.findAll(req.user!.organizationId, filter, pagination)
    res.status(200).json(successResponse(result))
  }

  async getById(req: Request, res: Response): Promise<void> {
    const contact = await contactService.findById(req.user!.organizationId, String(req.params.id))
    res.status(200).json(successResponse(contact))
  }

  async update(req: Request, res: Response): Promise<void> {
    const data = updateContactSchema.parse(req.body)
    const contact = await contactService.update(req.user!.organizationId, String(req.params.id), data)
    res.status(200).json(successResponse(contact, 'Contato atualizado com sucesso'))
  }

  async delete(req: Request, res: Response): Promise<void> {
    await contactService.delete(req.user!.organizationId, String(req.params.id))
    res.status(204).send()
  }
}
