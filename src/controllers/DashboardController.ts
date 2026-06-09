import { Request, Response } from 'express'
import { prisma } from '../config/prisma'

export class DashboardController {
  async index(_req: Request, res: Response): Promise<void> {
    const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

    const [athletesCount, usersCount, eventsCount, donations, allDonations, allAthletes] =
      await Promise.all([
        prisma.athlete.count(),
        prisma.user.count(),
        prisma.event.count(),
        prisma.donation.aggregate({
          _sum: { amount: true },
          where: { status: 'CONFIRMED' },
        }),
        prisma.donation.findMany({
          where: { status: 'CONFIRMED' },
          select: { amount: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.athlete.findMany({
          select: { createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
      ])

    const donationMap: Record<string, number> = {}
    for (const d of allDonations) {
      const month = MONTHS[new Date(d.createdAt).getMonth()]
      donationMap[month] = (donationMap[month] ?? 0) + Number(d.amount ?? 0)
    }

    const growthMap: Record<string, number> = {}
    for (const a of allAthletes) {
      const month = MONTHS[new Date(a.createdAt).getMonth()]
      growthMap[month] = (growthMap[month] ?? 0) + 1
    }

    const donationData = MONTHS.filter((m) => donationMap[m]).map((month) => ({
      month,
      valor: donationMap[month],
    }))

    const growthData = MONTHS.filter((m) => growthMap[m]).map((month) => ({
      month,
      atletas: growthMap[month],
    }))

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
