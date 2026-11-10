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

// Projeção de 90 dias — soma de faturas PENDING (inclusive já vencidas,
// que contam como impacto imediato) por dia, com saldo acumulado
// começando em zero. É fluxo líquido projetado a partir das faturas
// cadastradas, não saldo bancário real (o schema não modela conta
// bancária) — por isso o nome "projetado", não "saldo".
const CASH_FLOW_PROJECTION_DAYS = 90

export function buildCashFlowProjection(
  invoices: { type: 'RECEIVABLE' | 'PAYABLE'; amount: number; dueDate: Date }[],
  now: Date = new Date(),
): { date: string; in: number; out: number; balance: number }[] {
  const dayBuckets = new Map<string, { in: number; out: number }>()

  for (const invoice of invoices) {
    const due = invoice.dueDate < now ? now : invoice.dueDate
    const key = due.toISOString().slice(0, 10)
    const bucket = dayBuckets.get(key) ?? { in: 0, out: 0 }
    if (invoice.type === 'RECEIVABLE') {
      bucket.in += Number(invoice.amount)
    } else {
      bucket.out += Number(invoice.amount)
    }
    dayBuckets.set(key, bucket)
  }

  const sortedDates = [...dayBuckets.keys()].sort()
  let balance = 0

  return sortedDates.map((date) => {
    const bucket = dayBuckets.get(date)!
    balance += bucket.in - bucket.out
    return { date, in: bucket.in, out: bucket.out, balance }
  })
}

export class DashboardController {
  private async getDashboardData(organizationId: string) {

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const in90Days = new Date(now.getTime() + CASH_FLOW_PROJECTION_DAYS * 24 * 60 * 60 * 1000)

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
      projectedInvoices,
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
      prisma.invoice.findMany({
        where: {
          organizationId,
          status: { in: ['PENDING', 'OVERDUE'] },
          dueDate: { lte: in90Days },
        },
        select: { type: true, amount: true, dueDate: true },
      }),
    ])

    const cashFlowProjection = buildCashFlowProjection(
      projectedInvoices.map((invoice) => ({
        type: invoice.type,
        amount: Number(invoice.amount),
        dueDate: invoice.dueDate,
      })),
      now,
    )

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
      cashFlowProjection,
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
      cashFlowProjection: data.cashFlowProjection,
      goals,
    })
  }
}
