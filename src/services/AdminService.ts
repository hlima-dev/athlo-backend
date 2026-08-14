import { prisma } from '../config/prisma'
import { PaginationParams, paginate } from '../utils/pagination'
import { NotFoundError } from '../utils/AppError'

interface OrganizationFilter {
  search?: string
  status?: string
}

export class AdminService {
  async listOrganizations(filter: OrganizationFilter, pagination: PaginationParams) {
    const where = {
      ...(filter.search && {
        OR: [
          { name: { contains: filter.search, mode: 'insensitive' as const } },
          { slug: { contains: filter.search, mode: 'insensitive' as const } },
          { email: { contains: filter.search, mode: 'insensitive' as const } },
        ],
      }),
      ...(filter.status && { status: filter.status as never }),
    }

    const [data, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        include: {
          subscription: { include: { plan: true } },
          _count: { select: { users: true, contacts: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.organization.count({ where }),
    ])

    return paginate(data, total, pagination)
  }

  async getOrganization(id: string) {
    const organization = await prisma.organization.findUnique({
      where: { id },
      include: {
        subscription: { include: { plan: true } },
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            orgRole: true,
            status: true,
            createdAt: true,
          },
        },
        _count: {
          select: { contacts: true, products: true, invoices: true, orders: true, events: true },
        },
      },
    })

    if (!organization) {
      throw new NotFoundError('Organização')
    }

    return organization
  }

  async suspendOrganization(id: string, status: 'ACTIVE' | 'SUSPENDED') {
    const organization = await prisma.organization.findUnique({ where: { id } })
    if (!organization) {
      throw new NotFoundError('Organização')
    }

    return prisma.organization.update({
      where: { id },
      data: { status },
    })
  }

  async overview() {
    const [
      totalOrganizations,
      totalUsers,
      activeSubscriptions,
      trialingSubscriptions,
      pastDueSubscriptions,
      canceledSubscriptions,
      subscriptionsWithPlan,
    ] = await Promise.all([
      prisma.organization.count(),
      prisma.user.count(),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.subscription.count({ where: { status: 'TRIALING' } }),
      prisma.subscription.count({ where: { status: 'PAST_DUE' } }),
      prisma.subscription.count({ where: { status: 'CANCELED' } }),
      prisma.subscription.findMany({
        where: { status: 'ACTIVE' },
        include: { plan: true },
      }),
    ])

    const mrr = subscriptionsWithPlan.reduce(
      (sum, sub) => sum + Number(sub.plan.priceMonthly.toString()),
      0,
    )

    const recentOrganizations = await prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { subscription: { include: { plan: true } } },
    })

    return {
      totalOrganizations,
      totalUsers,
      subscriptions: {
        active: activeSubscriptions,
        trialing: trialingSubscriptions,
        pastDue: pastDueSubscriptions,
        canceled: canceledSubscriptions,
      },
      mrr,
      recentOrganizations,
    }
  }
}
