import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { successResponse, getPagination, paginate } from '../utils/pagination'
import { Sport, TrainingType } from '@prisma/client'
import { NotFoundError } from '../utils/AppError'

const createTrainingSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  type: z.nativeEnum(TrainingType),
  sport: z.nativeEnum(Sport),
  date: z.coerce.date(),
  durationMin: z.number().int().positive(),
  location: z.string().optional(),
  notes: z.string().optional(),
  coachId: z.string().cuid().optional(),
  eventId: z.string().cuid().optional(),
  athleteIds: z.array(z.string().cuid()).optional(),
})

export class TrainingController {
  async create(req: Request, res: Response): Promise<void> {
    const { athleteIds, ...data } = createTrainingSchema.parse(req.body)

    const training = await prisma.training.create({
      data: {
        ...data,
        athletes: athleteIds
          ? {
              create: athleteIds.map((athleteId) => ({ athleteId })),
            }
          : undefined,
      },
      include: {
        coach: { select: { id: true, name: true } },
        athletes: {
          include: {
            athlete: {
              include: { user: { select: { name: true } } },
            },
          },
        },
      },
    })

    res.status(201).json(successResponse(training, 'Treino criado com sucesso'))
  }

  async list(req: Request, res: Response): Promise<void> {
    const pagination = getPagination(req)
    const { sport, type, coachId } = req.query

    const where = {
      ...(sport && { sport: sport as Sport }),
      ...(type && { type: type as TrainingType }),
      ...(coachId && { coachId: coachId as string }),
    }

    const [trainings, total] = await Promise.all([
      prisma.training.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { date: 'desc' },
        include: {
          coach: { select: { id: true, name: true } },
          _count: { select: { athletes: true } },
        },
      }),
      prisma.training.count({ where }),
    ])

    res.status(200).json(successResponse(paginate(trainings, total, pagination)))
  }

  async getById(req: Request, res: Response): Promise<void> {
    const training = await prisma.training.findUnique({
      where: { id: req.params.id },
      include: {
        coach: { select: { id: true, name: true, avatar: true } },
        athletes: {
          include: {
            athlete: {
              include: { user: { select: { name: true, avatar: true } } },
            },
          },
        },
      },
    })

    if (!training) throw new NotFoundError('Treino')
    res.status(200).json(successResponse(training))
  }

  async update(req: Request, res: Response): Promise<void> {
    const { athleteIds, ...data } = createTrainingSchema.partial().parse(req.body)
    const training = await prisma.training.update({
      where: { id: req.params.id },
      data,
    })
    res.status(200).json(successResponse(training, 'Treino atualizado'))
  }

  async delete(req: Request, res: Response): Promise<void> {
    await prisma.training.delete({ where: { id: req.params.id } })
    res.status(204).send()
  }
}
