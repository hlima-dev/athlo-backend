import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '../config/prisma'
import { env } from '../config/env'
import { generateTokenPair, verifyRefreshToken } from '../utils/jwt'
import {
  UnauthorizedError,
  NotFoundError,
  ConflictError,
} from '../utils/AppError'
import { OrgRole } from '@prisma/client'
import { EmailService } from './EmailService'

interface RegisterInput {
  name: string
  email: string
  password: string
  phone?: string
  // Cria uma nova empresa (tenant)
  organizationName?: string
  // Ou entra numa empresa existente via convite
  inviteToken?: string
}

interface LoginInput {
  email: string
  password: string
}

interface ResetPasswordInput {
  token: string
  password: string
}

const emailService = new EmailService()

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'empresa'
}

export class AuthService {
  async register(input: RegisterInput) {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    })

    if (existing) {
      throw new ConflictError('E-mail já cadastrado')
    }

    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS)

    // ── Fluxo 1: aceitar convite para uma organização existente ──
    if (input.inviteToken) {
      const invite = await prisma.invite.findUnique({
        where: { token: input.inviteToken },
      })

      if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
        throw new UnauthorizedError('Convite inválido ou expirado')
      }

      const [user] = await prisma.$transaction([
        prisma.user.create({
          data: {
            organizationId: invite.organizationId,
            name: input.name,
            email: input.email,
            password: passwordHash,
            orgRole: invite.role,
            phone: input.phone,
          },
          include: { organization: true },
        }),
        prisma.invite.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date() },
        }),
      ])

      await this.sendVerificationEmail(user.id, user.email, user.name)
      return this.issueSession(user)
    }

    // ── Fluxo 2: cadastro self-service, cria a empresa (tenant) ──
    if (!input.organizationName) {
      throw new ConflictError('Informe o nome da empresa para criar sua conta')
    }

    const organization = await this.createOrganizationWithTrial(input.organizationName)

    const user = await prisma.user.create({
      data: {
        organizationId: organization.id,
        name: input.name,
        email: input.email,
        password: passwordHash,
        orgRole: OrgRole.OWNER,
        phone: input.phone,
      },
      include: { organization: true },
    })

    await this.sendVerificationEmail(user.id, user.email, user.name)
    return this.issueSession(user)
  }

  private async createOrganizationWithTrial(name: string) {
    const baseSlug = slugify(name)
    let slug = baseSlug
    let attempt = 0

    while (await prisma.organization.findUnique({ where: { slug } })) {
      attempt += 1
      slug = `${baseSlug}-${crypto.randomBytes(2).toString('hex')}`
      if (attempt > 5) break
    }

    const organization = await prisma.organization.create({
      data: { name, slug },
    })

    const defaultPlan = await prisma.plan.findFirst({
      where: { isActive: true },
      orderBy: { priceMonthly: 'asc' },
    })

    if (defaultPlan) {
      await prisma.subscription.create({
        data: {
          organizationId: organization.id,
          planId: defaultPlan.id,
          status: 'TRIALING',
          trialEndsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14), // 14 dias
        },
      })
    }

    return organization
  }

  private async issueSession(user: {
    id: string
    organizationId: string
    orgRole: OrgRole
    password: string
    refreshToken: string | null
    [key: string]: unknown
  }) {
    const tokens = generateTokenPair({
      sub: user.id,
      organizationId: user.organizationId,
      orgRole: user.orgRole,
    })

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken },
    })

    const {
      password: _password,
      refreshToken: _refreshToken,
      passwordResetToken: _passwordResetToken,
      passwordResetExpires: _passwordResetExpires,
      emailVerifyToken: _emailVerifyToken,
      emailVerifyExpires: _emailVerifyExpires,
      ...safeUser
    } = user as typeof user & {
      passwordResetToken?: unknown
      passwordResetExpires?: unknown
      emailVerifyToken?: unknown
      emailVerifyExpires?: unknown
    }

    return { user: safeUser, ...tokens }
  }

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: { organization: true },
    })

    // Mesmo erro independente de o usuário existir — evita user enumeration
    if (!user) {
      throw new UnauthorizedError('E-mail ou senha inválidos')
    }

    if (user.status === 'SUSPENDED') {
      throw new UnauthorizedError('Conta suspensa. Entre em contato com o suporte.')
    }

    if (user.status === 'INACTIVE') {
      throw new UnauthorizedError('Conta inativa.')
    }

    const passwordMatch = await bcrypt.compare(input.password, user.password)

    if (!passwordMatch) {
      throw new UnauthorizedError('E-mail ou senha inválidos')
    }

    return this.issueSession(user)
  }

  async refreshToken(token: string) {
    const payload = verifyRefreshToken(token)

    const user = await prisma.user.findFirst({
      where: { id: payload.sub, refreshToken: token },
    })

    if (!user) {
      throw new UnauthorizedError('Refresh token inválido ou revogado')
    }

    const tokens = generateTokenPair({
      sub: user.id,
      organizationId: user.organizationId,
      orgRole: user.orgRole,
    })

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken },
    })

    return tokens
  }

  async logout(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    })
  }

  async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email } })

    // Sempre retorna a mesma mensagem — evita user enumeration via forgot-password
    const genericResponse = {
      message: 'Se o e-mail estiver cadastrado, enviaremos as instruções de recuperação.',
    }

    if (!user) return genericResponse

    const resetToken = crypto.randomBytes(32).toString('hex')
    const resetTokenExpiresAt = new Date(Date.now() + 1000 * 60 * 30) // 30 min

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpires: resetTokenExpiresAt,
      },
    })

    // Envia e-mail — falha silenciosa para não expor se o email existe
    try {
      await emailService.sendPasswordReset(user.email, user.name, resetToken)
    } catch (err) {
      console.error('Erro ao enviar e-mail de recuperação:', err)
    }

    return genericResponse
  }

  async resetPassword(input: ResetPasswordInput) {
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: input.token,
        passwordResetExpires: { gt: new Date() },
      },
    })

    if (!user) {
      throw new UnauthorizedError('Token inválido ou expirado')
    }

    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null,
        refreshToken: null,
      },
    })

    return { message: 'Senha redefinida com sucesso.' }
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } })

    if (!user) {
      throw new NotFoundError('Usuário')
    }

    const passwordMatch = await bcrypt.compare(currentPassword, user.password)

    if (!passwordMatch) {
      throw new UnauthorizedError('Senha atual incorreta')
    }

    const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS)

    await prisma.user.update({
      where: { id: userId },
      data: {
        password: passwordHash,
        refreshToken: null, // força novo login em outros dispositivos
      },
    })

    return { message: 'Senha alterada com sucesso.' }
  }

  async updateProfile(userId: string, input: { name?: string; phone?: string; avatar?: string }) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: input,
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
    })

    return user
  }

  async sendVerificationEmail(userId: string, email: string, name: string) {
    const token = crypto.randomBytes(32).toString('hex')
    const expires = new Date(Date.now() + 1000 * 60 * 60 * 24) // 24h

    await prisma.user.update({
      where: { id: userId },
      data: {
        emailVerifyToken: token,
        emailVerifyExpires: expires,
      },
    })

    try {
      await emailService.sendEmailVerification(email, name, token)
    } catch (err) {
      console.error('Erro ao enviar e-mail de verificação:', err)
    }
  }

  async verifyEmail(token: string) {
    const user = await prisma.user.findFirst({
      where: {
        emailVerifyToken: token,
        emailVerifyExpires: { gt: new Date() },
      },
    })

    if (!user) {
      throw new UnauthorizedError('Token inválido ou expirado')
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerifyToken: null,
        emailVerifyExpires: null,
      },
    })

    return { message: 'E-mail verificado com sucesso.' }
  }

  async resendVerificationEmail(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } })

    if (!user) {
      throw new NotFoundError('Usuário')
    }

    if (user.emailVerifiedAt) {
      return { message: 'E-mail já verificado.' }
    }

    await this.sendVerificationEmail(user.id, user.email, user.name)

    return { message: 'E-mail de verificação reenviado.' }
  }

  async me(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        orgRole: true,
        status: true,
        avatar: true,
        phone: true,
        createdAt: true,
        organization: {
          include: { subscription: { include: { plan: true } } },
        },
      },
    })

    if (!user) {
      throw new NotFoundError('Usuário')
    }

    return user
  }
}
