import { prisma } from '../config/prisma'
import { NotFoundError, ConflictError } from '../utils/AppError'

export class SubscriptionService {
  async findByOrganization(organizationId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    })

    if (!subscription) {
      throw new NotFoundError('Assinatura')
    }

    return subscription
  }

  // Troca de plano — sem cobrança real ainda (ver roadmap de integração com Stripe).
  async changePlan(organizationId: string, planSlug: string) {
    const plan = await prisma.plan.findUnique({ where: { slug: planSlug } })

    if (!plan || !plan.isActive) {
      throw new ConflictError('Plano indisponível')
    }

    const usersCount = await prisma.user.count({ where: { organizationId } })
    if (usersCount > plan.maxUsers) {
      throw new ConflictError(
        `Este plano permite até ${plan.maxUsers} usuários — sua empresa tem ${usersCount}`,
      )
    }

    return prisma.subscription.upsert({
      where: { organizationId },
      update: { planId: plan.id, status: 'ACTIVE', canceledAt: null },
      create: { organizationId, planId: plan.id, status: 'ACTIVE' },
      include: { plan: true },
    })
  }

  async cancel(organizationId: string) {
    return prisma.subscription.update({
      where: { organizationId },
      data: { status: 'CANCELED', canceledAt: new Date() },
      include: { plan: true },
    })
  }
}
