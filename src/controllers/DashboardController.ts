import { Request, Response } from 'express'
import { prisma } from '../config/prisma'

export class DashboardController {
  async index(req: Request, res: Response): Promise<void> {
    const organizationId = req.user!.organizationId
    const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const [
      contactsCount,
      usersCount,
      eventsCount,
      pendingInvoicesCount,
      openOrdersCount,
      revenueThisMonth,
      allReceivables,
      allContacts,
      upcomingEvents,
    ] = await Promise.all([
      prisma.contact.count({ where: { organizationId } }),
      prisma.user.count({ where: { organizationId } }),
      prisma.event.count({ where: { organizationId } }),
      prisma.invoice.count({ where: { organizationId, status: 'PENDING' } }),
      prisma.order.count({
        where: { organizationId, status: { notIn: ['DELIVERED', 'CANCELED'] } },
      }),
      prisma.invoice.aggregate({
        _sum: { amount: true },
        where: {
          organizationId,
          type: 'RECEIVABLE',
          status: 'PAID',
          paidAt: { gte: startOfMonth },
        },
      }),
      prisma.invoice.findMany({
        where: { organizationId, type: 'RECEIVABLE', status: 'PAID' },
        select: { amount: true, paidAt: true },
        orderBy: { paidAt: 'asc' },
      }),
      prisma.contact.findMany({
        where: { organizationId },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.event.findMany({
        where: { organizationId, startDate: { gte: now } },
        orderBy: { startDate: 'asc' },
        take: 5,
        select: { id: true, title: true, type: true, startDate: true },
      }),
    ])

    const revenueMap: Record<string, number> = {}
    for (const invoice of allReceivables) {
      if (!invoice.paidAt) continue
      const month = MONTHS[new Date(invoice.paidAt).getMonth()]
      revenueMap[month] = (revenueMap[month] ?? 0) + Number(invoice.amount ?? 0)
    }

    const growthMap: Record<string, number> = {}
    for (const contact of allContacts) {
      const month = MONTHS[new Date(contact.createdAt).getMonth()]
      growthMap[month] = (growthMap[month] ?? 0) + 1
    }

    const revenueData = MONTHS.filter((m) => revenueMap[m]).map((month) => ({
      month,
      valor: revenueMap[month],
    }))

    const growthData = MONTHS.filter((m) => growthMap[m]).map((month) => ({
      month,
      contatos: growthMap[month],
    }))

    res.status(200).json({
      status: 'success',
      data: {
        contacts: contactsCount,
        users: usersCount,
        events: eventsCount,
        pendingInvoices: pendingInvoicesCount,
        openOrders: openOrdersCount,
        revenue: Number(revenueThisMonth._sum.amount ?? 0).toFixed(2),
        revenueData,
        growthData,
        upcomingEvents,
      },
    })
  }
}
