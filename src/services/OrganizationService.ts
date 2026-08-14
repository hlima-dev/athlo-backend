import bcrypt from 'bcryptjs'
import { prisma } from '../config/prisma'
import { NotFoundError, UnauthorizedError } from '../utils/AppError'
import { StripeService } from './StripeService'

const stripeService = new StripeService()

interface UpdateOrganizationInput {
  name?: string
  document?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
  logoUrl?: string
}

export class OrganizationService {
  async findById(id: string) {
    const organization = await prisma.organization.findUnique({
      where: { id },
      include: {
        subscription: { include: { plan: true } },
        _count: { select: { users: true, contacts: true } },
      },
    })

    if (!organization) {
      throw new NotFoundError('Empresa')
    }

    return organization
  }

  async update(id: string, input: UpdateOrganizationInput) {
    await this.findById(id)
    return prisma.organization.update({ where: { id }, data: input })
  }

  // LGPD — exclusão definitiva da empresa e cascata de todos os dados
  // (usuários, contatos, produtos, faturas, pedidos, eventos, convites).
  // Exige confirmação de senha do usuário OWNER que solicita a exclusão.
  async deleteOrganization(organizationId: string, userId: string, password: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } })

    if (!user) {
      throw new NotFoundError('Usuário')
    }

    const passwordMatch = await bcrypt.compare(password, user.password)
    if (!passwordMatch) {
      throw new UnauthorizedError('Senha incorreta')
    }

    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
    })

    if (subscription?.stripeSubscriptionId) {
      try {
        await stripeService.cancelStripeSubscription(subscription.stripeSubscriptionId)
      } catch (err) {
        console.error('Erro ao cancelar assinatura Stripe na exclusão da empresa:', err)
      }
    }

    await prisma.organization.delete({ where: { id: organizationId } })

    return { message: 'Empresa e todos os dados associados foram excluídos permanentemente.' }
  }

  async listMembers(organizationId: string) {
    return prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        orgRole: true,
        status: true,
        avatar: true,
        phone: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })
  }
}
