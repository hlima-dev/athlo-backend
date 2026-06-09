import { Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../config/prisma'
import { successResponse, getPagination, paginate } from '../utils/pagination'
import { DonationMethod, DonationStatus } from '@prisma/client'

const createDonationSchema = z.object({
  amount: z.number().positive('Valor deve ser positivo'),
  method: z.nativeEnum(DonationMethod),
  status: z.nativeEnum(DonationStatus).default(DonationStatus.PENDING),
  donorName: z.string().min(2).optional(),
  donorEmail: z.string().email().optional(),
  donorCpf: z.string().optional(),
  message: z.string().max(500).optional(),
})

export class DonationController {
  async create(req: Request, res: Response): Promise<void> {
    const data = createDonationSchema.parse(req.body)

    const donation = await prisma.donation.create({ data })

    // Notifica o admin sobre a nova doação
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })

    if (admin) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: 'DONATION_RECEIVED',
          title: 'Nova doação recebida',
          body: `${data.donorName || 'Um apoiador'} realizou uma doação de R$ ${Number(data.amount).toFixed(2)}.`,
        },
      })
    }

    res.status(201).json(successResponse(donation, 'Doação registrada com sucesso'))
  }

  async findAll(req: Request, res: Response): Promise<void> {
    const pagination = getPagination(req)

    const [donations, total] = await Promise.all([
      prisma.donation.findMany({
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.donation.count(),
    ])

    res.status(200).json(successResponse(paginate(donations, total, pagination)))
  }
}
