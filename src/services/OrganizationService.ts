import bcrypt from 'bcryptjs'
import { prisma } from '../config/prisma'
import { NotFoundError, UnauthorizedError } from '../utils/AppError'
import { StripeService } from './StripeService'
import { OrgModule, TaxRegime } from '@prisma/client'

const stripeService = new StripeService()

// Módulos com controle de acesso granular — mesma lista do enum OrgModule,
// usada pra sempre devolver os 5 na mesma ordem (inclusive os que o
// membro ainda não tem registro nenhum, como "desligado").
const ALL_MODULES = Object.values(OrgModule)

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
  taxRegime?: TaxRegime | null
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

  // OWNER/ADMIN sempre aparecem com todos os módulos "ligados" na
  // resposta (reflete o que requireModulePermission já faz de verdade —
  // não é um valor que se possa desligar pra esses dois papéis). Pra
  // MEMBER, módulo sem registro nenhum aparece como desligado.
  async getMemberPermissions(organizationId: string, userId: string) {
    const member = await prisma.user.findFirst({ where: { id: userId, organizationId } })
    if (!member) {
      throw new NotFoundError('Membro')
    }

    if (member.orgRole !== 'MEMBER') {
      return ALL_MODULES.map((module) => ({ module, enabled: true }))
    }

    const permissions = await prisma.modulePermission.findMany({
      where: { organizationId, userId },
    })
    const enabledMap = new Map(permissions.map((p) => [p.module, p.enabled]))

    return ALL_MODULES.map((module) => ({ module, enabled: enabledMap.get(module) ?? false }))
  }

  async updateMemberPermissions(
    organizationId: string,
    userId: string,
    updates: { module: OrgModule; enabled: boolean }[],
  ) {
    const member = await prisma.user.findFirst({ where: { id: userId, organizationId } })
    if (!member) {
      throw new NotFoundError('Membro')
    }

    await Promise.all(
      updates.map((update) =>
        prisma.modulePermission.upsert({
          where: { userId_module: { userId, module: update.module } },
          create: { organizationId, userId, module: update.module, enabled: update.enabled },
          update: { enabled: update.enabled },
        }),
      ),
    )

    return this.getMemberPermissions(organizationId, userId)
  }
}
