import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { successResponse, getPagination, paginate } from '../utils/pagination'
import { EventStatus, EventType } from '@prisma/client'
import { NotFoundError } from '../utils/AppError'

const createEventSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  type: z.nativeEnum(EventType),
  location: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  isOnline: z.boolean().default(false),
  onlineUrl: z.string().url().optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  registrationDeadline: z.coerce.date().optional(),
  maxParticipants: z.number().int().positive().optional(),
  isPublic: z.boolean().default(true),
})

export class EventController {
  async create(req: Request, res: Response): Promise<void> {
    const data = createEventSchema.parse(req.body)
    const event = await prisma.event.create({
      data: { ...data, createdById: req.user!.id },
    })
    res.status(201).json(successResponse(event, 'Evento criado com sucesso'))
  }

  async list(req: Request, res: Response): Promise<void> {
    const pagination = getPagination(req)
    const { type, status } = req.query

    const where = {
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
          _count: { select: { athletes: true } },
        },
      }),
      prisma.event.count({ where }),
    ])

    res.status(200).json(successResponse(paginate(events, total, pagination)))
  }

  async getById(req: Request, res: Response): Promise<void> {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: {
        createdBy: { select: { id: true, name: true } },
        athletes: {
          include: {
            athlete: {
              include: { user: { select: { name: true, avatar: true } } },
            },
          },
        },
        trainings: true,
      },
    })

    if (!event) throw new NotFoundError('Evento')
    res.status(200).json(successResponse(event))
  }

  async update(req: Request, res: Response): Promise<void> {
    const data = createEventSchema.partial().parse(req.body)
    const event = await prisma.event.update({
      where: { id: req.params.id },
      data,
    })
    res.status(200).json(successResponse(event, 'Evento atualizado'))
  }

  async delete(req: Request, res: Response): Promise<void> {
    await prisma.event.delete({ where: { id: req.params.id } })
    res.status(204).send()
  }
}
