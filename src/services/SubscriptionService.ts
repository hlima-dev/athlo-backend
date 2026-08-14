import { prisma } from '../config/prisma'
import { NotFoundError, ConflictError } from '../utils/AppError'
import { StripeService } from './StripeService'

const stripeService = new StripeService()

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

  // Troca direta de plano — só permitida para o plano Free (sem cobrança).
  // Planos pagos são assinados via Stripe Checkout (ver StripeService).
  async changePlan(organizationId: string, planSlug: string) {
    const plan = await prisma.plan.findUnique({ where: { slug: planSlug } })

    if (!plan || !plan.isActive) {
      throw new ConflictError('Plano indisponível')
    }

    if (Number(plan.priceMonthly) > 0) {
      throw new ConflictError(
        'Planos pagos são contratados pelo checkout do Stripe. Use o botão "Assinar" na tela de planos.',
      )
    }

    const usersCount = await prisma.user.count({ where: { organizationId } })
    if (usersCount > plan.maxUsers) {
      throw new ConflictError(
        `Este plano permite até ${plan.maxUsers} usuários — sua empresa tem ${usersCount}`,
      )
    }

    const current = await prisma.subscription.findUnique({ where: { organizationId } })
    if (current?.stripeSubscriptionId) {
      await stripeService.cancelStripeSubscription(current.stripeSubscriptionId)
    }

    return prisma.subscription.upsert({
      where: { organizationId },
      update: { planId: plan.id, status: 'ACTIVE', canceledAt: null, stripeSubscriptionId: null },
      create: { organizationId, planId: plan.id, status: 'ACTIVE' },
      include: { plan: true },
    })
  }

  async cancel(organizationId: string) {
    const current = await prisma.subscription.findUnique({ where: { organizationId } })

    if (current?.stripeSubscriptionId) {
      await stripeService.cancelStripeSubscription(current.stripeSubscriptionId)
    }

    return prisma.subscription.update({
      where: { organizationId },
      data: { status: 'CANCELED', canceledAt: new Date() },
      include: { plan: true },
    })
  }
}
