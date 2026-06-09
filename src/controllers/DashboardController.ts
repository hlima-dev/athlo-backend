import { Request, Response } from 'express'
import { prisma } from '../config/prisma'

export class DashboardController {
  async index(_req: Request, res: Response): Promise<void> {
    const [
      athletesCount,
      usersCount,
      eventsCount,
      donations,
      donationsByMonth,
      growthByMonth,
    ] = await Promise.all([
      prisma.athlete.count(),
      prisma.user.count(),
      prisma.event.count(),
      prisma.donation.aggregate({
        _sum: { amount: true },
        where: { status: 'CONFIRMED' },
      }),
      prisma.donation.groupBy({
        by: ['createdAt'],
        _sum: { amount: true },
        where: { status: 'CONFIRMED' },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.athlete.groupBy({
        by: ['createdAt'],
        _count: { id: true },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

    const donationMap: Record<string, number> = {}
    for (const row of donationsByMonth) {
      const month = MONTHS[new Date(row.createdAt).getMonth()]
      donationMap[month] = (donationMap[month] ?? 0) + Number(row._sum.amount ?? 0)
    }

    const growthMap: Record<string, number> = {}
    for (const row of growthByMonth) {
      const month = MONTHS[new Date(row.createdAt).getMonth()]
      growthMap[month] = (growthMap[month] ?? 0) + (row._count.id ?? 0)
    }

    const donationData = Object.entries(donationMap).map(([month, valor]) => ({ month, valor }))
    const growthData = Object.entries(growthMap).map(([month, atletas]) => ({ month, atletas }))

    res.status(200).json({
      status: 'success',
      data: {
        athletes: athletesCount,
        users: usersCount,
        events: eventsCount,
        donations: Number(donations._sum.amount ?? 0).toFixed(2),
        donationData,
        growthData,
      },
    })
  }
}
