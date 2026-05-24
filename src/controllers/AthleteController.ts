import { Request, Response } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'

import { AthleteService } from '../services/AthleteService'
import { getPagination, successResponse } from '../utils/pagination'
import {
  AmpLevel,
  AthleteStatus,
  Sport,
  UserRole,
  UserStatus,
} from '@prisma/client'
import { prisma } from '../config/prisma'

const athleteService = new AthleteService()

const createAthleteSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6).default('Athlete@2024'),
  birthDate: z.coerce.date(),
  ampLevel: z.nativeEnum(AmpLevel),
  sport: z.nativeEnum(Sport),
  cpf: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
})

const updateAthleteSchema = z
  .object({
    birthDate: z.coerce.date().optional(),
    ampLevel: z.nativeEnum(AmpLevel).optional(),
    sport: z.nativeEnum(Sport).optional(),
    cpf: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    emergencyContactName: z.string().optional(),
    emergencyContactPhone: z.string().optional(),
    status: z.nativeEnum(AthleteStatus).optional(),
    height: z.number().positive().optional(),
    weight: z.number().positive().optional(),
    classification: z.string().optional(),
  })

export class AthleteController {
  async create(req: Request, res: Response): Promise<void> {
    const data = createAthleteSchema.parse(req.body)

    const hashedPassword = await bcrypt.hash(data.password, 12)

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: UserRole.ATHLETE,
        status: UserStatus.ACTIVE,
      },
    })

    const athlete = await athleteService.create({
      userId: user.id,
      birthDate: data.birthDate,
      ampLevel: data.ampLevel,
      sport: data.sport,
      cpf: data.cpf,
      city: data.city,
      state: data.state,
      emergencyContactName: data.emergencyContactName,
      emergencyContactPhone: data.emergencyContactPhone,
    })

    res
      .status(201)
      .json(successResponse(athlete, 'Atleta cadastrado com sucesso'))
  }

  async list(req: Request, res: Response): Promise<void> {
    const pagination = getPagination(req)

    const filter = {
      sport: req.query.sport as Sport | undefined,
      status: req.query.status as AthleteStatus | undefined,
      ampLevel: req.query.ampLevel as AmpLevel | undefined,
      city: req.query.city as string | undefined,
      search: req.query.search as string | undefined,
    }

    const result = await athleteService.findAll(filter, pagination)

    res.status(200).json(successResponse(result))
  }

  async getById(req: Request, res: Response): Promise<void> {
    const athlete = await athleteService.findById(
  String(req.params.id) as string
)
    res.status(200).json(successResponse(athlete))
  }

  async update(req: Request, res: Response): Promise<void> {
    const data = updateAthleteSchema.parse(req.body)

    const athlete = await athleteService.update(
  String(req.params.id) as string,
  data
)

    res.status(200).json(successResponse(athlete, 'Atleta atualizado com sucesso'))
  }

  async delete(req: Request, res: Response): Promise<void> {
    await athleteService.delete(
  String(req.params.id) as string
)

    res.status(204).send()
  }
}