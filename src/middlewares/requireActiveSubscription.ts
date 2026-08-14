import { NextFunction, Request, Response } from 'express'
import { prisma } from '../config/prisma'
import { PaymentRequiredError, UnauthorizedError } from '../utils/AppError'

// Bloqueia acesso aos módulos de negócio quando o período de teste acabou
// ou a assinatura não está ativa. Deve rodar depois de `authenticate`.
export async function requireActiveSubscription(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError()
  }

  const subscription = await prisma.subscription.findUnique({
    where: { organizationId: req.user.organizationId },
  })

  if (!subscription) {
    throw new PaymentRequiredError('Sua empresa ainda não tem uma assinatura configurada')
  }

  const now = new Date()

  const trialActive =
    subscription.status === 'TRIALING' &&
    (!subscription.trialEndsAt || subscription.trialEndsAt > now)

  const isActive = subscription.status === 'ACTIVE' || trialActive

  if (!isActive) {
    const message =
      subscription.status === 'TRIALING'
        ? 'Seu período de teste gratuito terminou. Escolha um plano para continuar.'
        : 'Sua assinatura não está ativa. Atualize o pagamento para continuar.'
    throw new PaymentRequiredError(message)
  }

  next()
}
