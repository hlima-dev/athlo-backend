import { prisma } from '../config/prisma'
import { NotFoundError } from '../utils/AppError'
import { getPagination, paginate, PaginationParams } from '../utils/pagination'
import { AmpLevel, AthleteStatus, Sport } from '@prisma/client'

interface CreateAthleteInput {
  userId: string
  birthDate: Date
  ampLevel: AmpLevel
  sport: Sport
  cpf?: string
  city?: string
  state?: string
  emergencyContactName?: string
  emergencyContactPhone?: string
}

interface UpdateAthleteInput extends Partial<CreateAthleteInput> {
  status?: AthleteStatus
  height?: number
  weight?: number
  classification?: string
}

interface ListAthletesFilter {
  sport?: Sport
  status?: AthleteStatus
  ampLevel?: AmpLevel
  city?: string
  search?: string
}

export class AthleteService {
  async create(input: CreateAthleteInput) {
    const registrationCode = await this.generateRegistrationCode()

    return prisma.athlete.create({
      data: {
        ...input,
        registrationCode,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
    })
  }

  async findAll(filter: ListAthletesFilter, pagination: PaginationParams) {
    const where = {
      ...(filter.sport && { sport: filter.sport }),
      ...(filter.status && { status: filter.status }),
      ...(filter.ampLevel && { ampLevel: filter.ampLevel }),
      ...(filter.city && { city: { contains: filter.city } }),
      ...(filter.search && {
        user: {
          name: { contains: filter.search },
        },
      }),
    }

    const [athletes, total] = await Promise.all([
      prisma.athlete.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true, avatar: true },
          },
        },
      }),
      prisma.athlete.count({ where }),
    ])

    return paginate(athletes, total, pagination)
  }

  async findById(id: string) {
    const athlete = await prisma.athlete.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar: true, phone: true },
        },
        achievements: {
          orderBy: { date: 'desc' },
        },
        metrics: {
          orderBy: { date: 'desc' },
          take: 20,
        },
      },
    })

    if (!athlete) {
      throw new NotFoundError('Atleta')
    }

    return athlete
  }

  async update(id: string, input: UpdateAthleteInput) {
    await this.findById(id)

    return prisma.athlete.update({
      where: { id },
      data: input,
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar: true },
        },
      },
    })
  }

  async delete(id: string) {
    await this.findById(id)
    await prisma.athlete.delete({ where: { id } })
  }

  private async generateRegistrationCode(): Promise<string> {
    const year = new Date().getFullYear()
    const count = await prisma.athlete.count()
    return `ASDA-${year}-${String(count + 1).padStart(4, '0')}`
  }
}
