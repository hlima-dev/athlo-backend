import Stripe from 'stripe'
import { prisma } from '../config/prisma'
import { env } from '../config/env'
import { ConflictError, NotFoundError, ValidationError } from '../utils/AppError'
import { SubscriptionStatus } from '@prisma/client'

let client: Stripe | null = null

function getClient(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new ValidationError(
      'Cobrança não configurada. Peça ao administrador para definir STRIPE_SECRET_KEY.'
    )
  }
  if (!client) {
    client = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' })
  }
  return client
}

// Mapeamento estático plano -> variável de ambiente com o Price ID do
// Stripe. O plano Free não tem cobrança, então não entra aqui.
const PRICE_ENV_BY_SLUG: Record<string, string | undefined> = {
  starter: env.STRIPE_PRICE_ID_STARTER,
  pro: env.STRIPE_PRICE_ID_PRO,
}

function getPriceIdForSlug(slug: string): string {
  const priceId = PRICE_ENV_BY_SLUG[slug]
  if (!priceId) {
    throw new ValidationError(
      `Plano "${slug}" não tem um preço configurado no Stripe (STRIPE_PRICE_ID_${slug.toUpperCase()}).`
    )
  }
  return priceId
}

function getSlugForPriceId(priceId: string): string | null {
  for (const [slug, envPriceId] of Object.entries(PRICE_ENV_BY_SLUG)) {
    if (envPriceId === priceId) return slug
  }
  return null
}

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case 'active':
      return SubscriptionStatus.ACTIVE
    case 'trialing':
      return SubscriptionStatus.TRIALING
    case 'canceled':
    case 'incomplete_expired':
      return SubscriptionStatus.CANCELED
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
    case 'paused':
    default:
      return SubscriptionStatus.PAST_DUE
  }
}

export class StripeService {
  async createCheckoutSession(organizationId: string, userId: string, planSlug: string) {
    const stripe = getClient()
    const priceId = getPriceIdForSlug(planSlug)

    const plan = await prisma.plan.findUnique({ where: { slug: planSlug } })
    if (!plan || !plan.isActive) {
      throw new NotFoundError('Plano')
    }

    const [subscription, user] = await Promise.all([
      prisma.subscription.findUnique({ where: { organizationId } }),
      prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    ])

    let stripeCustomerId = subscription?.stripeCustomerId ?? undefined

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { organizationId },
      })
      stripeCustomerId = customer.id

      await prisma.subscription.upsert({
        where: { organizationId },
        update: { stripeCustomerId },
        create: { organizationId, planId: plan.id, stripeCustomerId },
      })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${env.APP_URL}/configuracoes?checkout=sucesso`,
      cancel_url: `${env.APP_URL}/configuracoes?checkout=cancelado`,
      metadata: { organizationId, planSlug },
      subscription_data: {
        metadata: { organizationId, planSlug },
      },
    })

    if (!session.url) {
      throw new ValidationError('Não foi possível iniciar o checkout do Stripe.')
    }

    return { url: session.url }
  }

  async createPortalSession(organizationId: string) {
    const stripe = getClient()

    const subscription = await prisma.subscription.findUnique({ where: { organizationId } })
    if (!subscription?.stripeCustomerId) {
      throw new ConflictError('Nenhuma assinatura paga encontrada para gerenciar.')
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${env.APP_URL}/configuracoes`,
    })

    return { url: session.url }
  }

  async cancelStripeSubscription(stripeSubscriptionId: string): Promise<void> {
    const stripe = getClient()
    try {
      await stripe.subscriptions.cancel(stripeSubscriptionId)
    } catch (err) {
      // Já cancelada no Stripe ou inexistente — segue o fluxo, o registro
      // local ainda será marcado como cancelado pelo chamador.
      console.error('Erro ao cancelar assinatura no Stripe:', err)
    }
  }

  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const stripe = getClient()
    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw new ValidationError('STRIPE_WEBHOOK_SECRET não configurado.')
    }
    return stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET)
  }

  private async findSubscriptionRow(stripeSubscription: Stripe.Subscription) {
    const organizationId = stripeSubscription.metadata?.organizationId

    if (organizationId) {
      const byOrg = await prisma.subscription.findUnique({ where: { organizationId } })
      if (byOrg) return byOrg
    }

    const customerId =
      typeof stripeSubscription.customer === 'string'
        ? stripeSubscription.customer
        : stripeSubscription.customer.id

    return prisma.subscription.findFirst({ where: { stripeCustomerId: customerId } })
  }

  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription' || !session.subscription) return

        const organizationId = session.metadata?.organizationId
        const planSlug = session.metadata?.planSlug
        if (!organizationId || !planSlug) return

        const plan = await prisma.plan.findUnique({ where: { slug: planSlug } })
        if (!plan) return

        const stripe = getClient()
        const subscriptionId =
          typeof session.subscription === 'string' ? session.subscription : session.subscription.id
        const stripeSub = await stripe.subscriptions.retrieve(subscriptionId)

        await prisma.subscription.upsert({
          where: { organizationId },
          update: {
            planId: plan.id,
            status: mapStripeStatus(stripeSub.status),
            stripeCustomerId:
              typeof session.customer === 'string' ? session.customer : session.customer?.id,
            stripeSubscriptionId: stripeSub.id,
            currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
            canceledAt: null,
          },
          create: {
            organizationId,
            planId: plan.id,
            status: mapStripeStatus(stripeSub.status),
            stripeCustomerId:
              typeof session.customer === 'string' ? session.customer : session.customer?.id,
            stripeSubscriptionId: stripeSub.id,
            currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
          },
        })
        break
      }

      case 'customer.subscription.updated': {
        const stripeSub = event.data.object as Stripe.Subscription
        const row = await this.findSubscriptionRow(stripeSub)
        if (!row) return

        const priceId = stripeSub.items.data[0]?.price?.id
        const slug = priceId ? getSlugForPriceId(priceId) : null
        const plan = slug ? await prisma.plan.findUnique({ where: { slug } }) : null

        await prisma.subscription.update({
          where: { id: row.id },
          data: {
            status: mapStripeStatus(stripeSub.status),
            currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
            ...(plan && { planId: plan.id }),
            canceledAt: stripeSub.cancel_at ? new Date(stripeSub.cancel_at * 1000) : null,
          },
        })
        break
      }

      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object as Stripe.Subscription
        const row = await this.findSubscriptionRow(stripeSub)
        if (!row) return

        await prisma.subscription.update({
          where: { id: row.id },
          data: { status: SubscriptionStatus.CANCELED, canceledAt: new Date() },
        })
        break
      }

      default:
        break
    }
  }
}
