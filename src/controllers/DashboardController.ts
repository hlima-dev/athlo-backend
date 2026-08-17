import { Request, Response } from 'express'
import { prisma } from '../config/prisma'
import { ExportService } from '../services/ExportService'

const exportService = new ExportService()

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Mesmas metas fixas usadas na tela de Relatórios do front — mantidas
// aqui também para a exportação em xlsx bater com o que aparece na tela.
const GOAL_TARGETS = {
  contacts: 50,
  events: 10,
  revenue: 5000,
}

export class DashboardController {
  private async getDashboardData(organizationId: string) {

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

    const revenue = Number(revenueThisMonth._sum.amount ?? 0)

    return {
      contacts: contactsCount,
      users: usersCount,
      events: eventsCount,
      pendingInvoices: pendingInvoicesCount,
      openOrders: openOrdersCount,
      revenue,
      revenueData,
      growthData,
      upcomingEvents,
    }
  }

  async index(req: Request, res: Response): Promise<void> {
    const data = await this.getDashboardData(req.user!.organizationId)

    res.status(200).json({
      status: 'success',
      data: { ...data, revenue: data.revenue.toFixed(2) },
    })
  }

  async export(req: Request, res: Response): Promise<void> {
    const organizationId = req.user!.organizationId

    const [data, organization] = await Promise.all([
      this.getDashboardData(organizationId),
      prisma.organization.findUnique({ where: { id: organizationId } }),
    ])

    const goals = [
      {
        title: `Contatos vs meta (${GOAL_TARGETS.contacts})`,
        value: Math.min(Math.round((data.contacts / GOAL_TARGETS.contacts) * 100), 100),
      },
      {
        title: `Compromissos vs meta (${GOAL_TARGETS.events})`,
        value: Math.min(Math.round((data.events / GOAL_TARGETS.events) * 100), 100),
      },
      {
        title: `Receita vs meta (R$ ${GOAL_TARGETS.revenue.toLocaleString('pt-BR')})`,
        value: Math.min(Math.round((data.revenue / GOAL_TARGETS.revenue) * 100), 100),
      },
    ]

    await exportService.streamDashboardReport(res, {
      organizationName: organization?.name || 'ATHLO',
      contacts: data.contacts,
      revenue: data.revenue,
      events: data.events,
      pendingInvoices: data.pendingInvoices,
      openOrders: data.openOrders,
      growthData: data.growthData,
      revenueData: data.revenueData,
      goals,
    })
  }
}
