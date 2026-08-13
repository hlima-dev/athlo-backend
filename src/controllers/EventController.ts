import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { successResponse, getPagination, paginate } from '../utils/pagination'
import { EventStatus, EventType } from '@prisma/client'
import { NotFoundError } from '../utils/AppError'
import { optionalUrl } from '../utils/validation'
import { EventTextParserService } from '../services/EventTextParserService'

const eventTextParserService = new EventTextParserService()

const quickParseSchema = z.object({
  prompt: z.string().min(3, 'Descreva o compromisso em ao menos algumas palavras'),
})

const createEventSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  type: z.nativeEnum(EventType).optional(),
  status: z.nativeEnum(EventStatus).optional(),
  location: z.string().optional(),
  isOnline: z.boolean().default(false),
  onlineUrl: optionalUrl,
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  allDay: z.boolean().optional(),
  contactId: z.string().optional(),
  assignedToId: z.string().optional(),
})

export class EventController {
  async create(req: Request, res: Response): Promise<void> {
    const data = createEventSchema.parse(req.body)
    const event = await prisma.event.create({
      data: {
        ...data,
        organizationId: req.user!.organizationId,
        createdById: req.user!.id,
      },
    })
    res.status(201).json(successResponse(event, 'Evento criado com sucesso'))
  }

  async list(req: Request, res: Response): Promise<void> {
    const pagination = getPagination(req)
    const { type, status } = req.query

    const where = {
      organizationId: req.user!.organizationId,
      ...(type && { type: type as EventType }),
      ...(status && { status: status as EventStatus }),
    }

    const [events, total] = await Promise.all([
      prisma.event.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { startDate: 'asc' },
        include: {
          createdBy: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
          contact: { select: { id: true, name: true } },
        },
      }),
      prisma.event.count({ where }),
    ])

    res.status(200).json(successResponse(paginate(events, total, pagination)))
  }

  async getById(req: Request, res: Response): Promise<void> {
    const event = await prisma.event.findFirst({
      where: { id: String(req.params.id), organizationId: req.user!.organizationId },
      include: {
        createdBy: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true } },
      },
    })

    if (!event) throw new NotFoundError('Evento')
    res.status(200).json(successResponse(event))
  }

  async update(req: Request, res: Response): Promise<void> {
    const data = createEventSchema.partial().parse(req.body)

    const existing = await prisma.event.findFirst({
      where: { id: String(req.params.id), organizationId: req.user!.organizationId },
    })
    if (!existing) throw new NotFoundError('Evento')

    const event = await prisma.event.update({
      where: { id: existing.id },
      data,
    })
    res.status(200).json(successResponse(event, 'Evento atualizado'))
  }

  async delete(req: Request, res: Response): Promise<void> {
    const existing = await prisma.event.findFirst({
      where: { id: String(req.params.id), organizationId: req.user!.organizationId },
    })
    if (!existing) throw new NotFoundError('Evento')

    await prisma.event.delete({ where: { id: existing.id } })
    res.status(204).send()
  }

  async parseFromText(req: Request, res: Response): Promise<void> {
    const { prompt } = quickParseSchema.parse(req.body)
    const draft = eventTextParserService.parse(prompt)
    res.status(200).json(successResponse(draft))
  }
}
