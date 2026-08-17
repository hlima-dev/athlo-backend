import crypto from 'crypto'
import { prisma } from '../config/prisma'
import { env } from '../config/env'
import { ConflictError, NotFoundError } from '../utils/AppError'
import { OrgRole } from '@prisma/client'
import { EmailService } from './EmailService'

interface CreateInviteInput {
  email: string
  role?: OrgRole
}

const emailService = new EmailService()

export class InviteService {
  async create(organizationId: string, invitedById: string, input: CreateInviteInput) {
    // Um e-mail já ter conta em OUTRA empresa não bloqueia mais o convite
    // — é assim que o mesmo login passa a ter acesso a várias empresas
    // (múltiplos CNPJs). Só bloqueia se já for membro DESTA organização.
    const existingMembership = await prisma.membership.findFirst({
      where: { organizationId, user: { email: input.email } },
    })
    if (existingMembership) {
      throw new ConflictError('Este e-mail já faz parte da sua empresa')
    }

    const pendingInvite = await prisma.invite.findFirst({
      where: { organizationId, email: input.email, acceptedAt: null, expiresAt: { gt: new Date() } },
    })
    if (pendingInvite) {
      throw new ConflictError('Já existe um convite pendente para este e-mail')
    }

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    })

    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    })

    if (subscription?.plan) {
      const usersCount = await prisma.user.count({ where: { organizationId } })
      const pendingInvites = await prisma.invite.count({
        where: { organizationId, acceptedAt: null, expiresAt: { gt: new Date() } },
      })

      if (usersCount + pendingInvites >= subscription.plan.maxUsers) {
        throw new ConflictError(
          `Seu plano permite até ${subscription.plan.maxUsers} usuários. Faça upgrade para convidar mais pessoas.`,
        )
      }
    }

    const token = crypto.randomBytes(24).toString('hex')

    const invite = await prisma.invite.create({
      data: {
        organizationId,
        email: input.email,
        role: input.role ?? OrgRole.MEMBER,
        token,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7), // 7 dias
        invitedById,
      },
    })

    const inviteUrl = `${env.APP_URL}/registrar?invite=${token}`

    try {
      await emailService.sendInvite(input.email, organization.name, inviteUrl)
    } catch (err) {
      console.error('Erro ao enviar e-mail de convite:', err)
    }

    return invite
  }

  async findAll(organizationId: string) {
    return prisma.invite.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async revoke(organizationId: string, id: string) {
    const invite = await prisma.invite.findFirst({ where: { id, organizationId } })
    if (!invite) {
      throw new NotFoundError('Convite')
    }
    await prisma.invite.delete({ where: { id } })
  }
}
