import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '../config/prisma'
import { env } from '../config/env'
import {
  generateTokenPair,
  verifyRefreshToken,
  generatePreAuthToken,
  verifyPreAuthToken,
} from '../utils/jwt'
import {
  UnauthorizedError,
  ForbiddenError,
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

// Bloqueio por força bruta na própria conta — complementa o authLimiter
// (que só limita por IP e não impede alguém de trocar de IP a cada
// tentativa contra a mesma conta).
const MAX_FAILED_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 1000 * 60 * 15 // 15 minutos

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

    // ── Fluxo 1: aceitar convite para uma organização existente ──
    if (input.inviteToken) {
      const invite = await prisma.invite.findUnique({
        where: { token: input.inviteToken },
      })

      if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
        throw new UnauthorizedError('Convite inválido ou expirado')
      }

      // E-mail já tem conta em outra empresa: em vez de criar um segundo
      // usuário (o e-mail é único), a senha informada é validada contra
      // a conta existente e o convite vira uma Membership nova — a mesma
      // identidade passa a ter acesso a mais uma empresa.
      if (existing) {
        const passwordMatch = await bcrypt.compare(input.password, existing.password)
        if (!passwordMatch) {
          throw new UnauthorizedError(
            'Este e-mail já tem uma conta no ATHLO. Informe a senha dessa conta para aceitar o convite.',
          )
        }

        await prisma.$transaction([
          prisma.membership.upsert({
            where: {
              userId_organizationId: { userId: existing.id, organizationId: invite.organizationId },
            },
            update: { orgRole: invite.role },
            create: { userId: existing.id, organizationId: invite.organizationId, orgRole: invite.role },
          }),
          prisma.invite.update({
            where: { id: invite.id },
            data: { acceptedAt: new Date() },
          }),
        ])

        return this.issueSession(existing, { organizationId: invite.organizationId, orgRole: invite.role })
      }

      const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS)

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

      await prisma.membership.create({
        data: { userId: user.id, organizationId: invite.organizationId, orgRole: invite.role },
      })

      await this.sendVerificationEmail(user.id, user.email, user.name)
      return this.issueSession(user)
    }

    // ── Fluxo 2: cadastro self-service, cria a empresa (tenant) ──
    if (existing) {
      throw new ConflictError('E-mail já cadastrado')
    }

    if (!input.organizationName) {
      throw new ConflictError('Informe o nome da empresa para criar sua conta')
    }

    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS)
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

    await prisma.membership.create({
      data: { userId: user.id, organizationId: organization.id, orgRole: OrgRole.OWNER },
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

  private async issueSession(
    user: {
      id: string
      organizationId: string
      orgRole: OrgRole
      password: string
      refreshToken: string | null
      [key: string]: unknown
    },
    // Permite emitir a sessão para uma empresa diferente da "padrão" do
    // usuário (User.organizationId) — usado na seleção/troca de
    // organização, quando o login tem acesso a mais de uma via Membership.
    activeOrg?: { organizationId: string; orgRole: OrgRole },
  ) {
    const organizationId = activeOrg?.organizationId ?? user.organizationId
    const orgRole = activeOrg?.orgRole ?? user.orgRole

    const tokens = generateTokenPair({
      sub: user.id,
      organizationId,
      orgRole,
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

    // A organização "ativa" da sessão pode ser diferente da organização
    // padrão do usuário (User.organizationId) — busca os dados corretos
    // para devolver ao front, senão a tela mostraria a empresa errada
    // logo depois de trocar de unidade.
    const activeOrganization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { subscription: { include: { plan: true } } },
    })

    const memberships = await prisma.membership.findMany({
      where: { userId: user.id },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    })

    return {
      user: {
        ...safeUser,
        organizationId,
        orgRole,
        organization: activeOrganization,
        organizations: memberships.map((m) => ({
          id: m.organizationId,
          name: m.organization.name,
          slug: m.organization.slug,
          orgRole: m.orgRole,
        })),
      },
      ...tokens,
    }
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

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedError(
        'Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em alguns minutos ou redefina sua senha.',
      )
    }

    const passwordMatch = await bcrypt.compare(input.password, user.password)

    if (!passwordMatch) {
      const attempts = user.failedLoginAttempts + 1
      const lockingNow = attempts >= MAX_FAILED_LOGIN_ATTEMPTS

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: lockingNow ? 0 : attempts,
          lockedUntil: lockingNow ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null,
        },
      })

      throw new UnauthorizedError('E-mail ou senha inválidos')
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      })
    }

    const memberships = await prisma.membership.findMany({
      where: { userId: user.id },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    })

    // Login tem acesso a mais de uma empresa (múltiplos CNPJs sob o mesmo
    // e-mail) — não emite sessão ainda, devolve a lista para o front
    // mostrar a tela de seleção, como no seletor de unidade de referência.
    if (memberships.length > 1) {
      return {
        requiresOrgSelection: true as const,
        preAuthToken: generatePreAuthToken(user.id),
        organizations: memberships.map((m) => ({
          id: m.organizationId,
          name: m.organization.name,
          slug: m.organization.slug,
          orgRole: m.orgRole,
        })),
      }
    }

    const single = memberships[0]
    return this.issueSession(
      user,
      single ? { organizationId: single.organizationId, orgRole: single.orgRole } : undefined,
    )
  }

  // Segunda etapa do login quando há mais de uma organização — troca o
  // preAuthToken (emitido logo após a senha ser validada) pela sessão de
  // verdade, já apontando para a empresa escolhida.
  async selectOrganization(preAuthToken: string, organizationId: string) {
    let userId: string
    try {
      userId = verifyPreAuthToken(preAuthToken)
    } catch {
      throw new UnauthorizedError('Sessão de login expirada. Faça login novamente.')
    }

    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    })

    if (!membership) {
      throw new ForbiddenError('Você não tem acesso a essa organização.')
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      throw new NotFoundError('Usuário')
    }

    return this.issueSession(user, { organizationId, orgRole: membership.orgRole })
  }

  // "Trocar Unidade" — já autenticado, sem precisar da senha de novo.
  async switchOrganization(userId: string, organizationId: string) {
    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    })

    if (!membership) {
      throw new ForbiddenError('Você não tem acesso a essa organização.')
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      throw new NotFoundError('Usuário')
    }

    return this.issueSession(user, { organizationId, orgRole: membership.orgRole })
  }

  async listMyOrganizations(userId: string) {
    const memberships = await prisma.membership.findMany({
      where: { userId },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    })

    return memberships.map((m) => ({
      id: m.organizationId,
      name: m.organization.name,
      slug: m.organization.slug,
      orgRole: m.orgRole,
    }))
  }

  // Permite que quem já está logado crie mais uma empresa (outro CNPJ) e
  // vira automaticamente dono (OWNER) dela, sem precisar de um novo
  // cadastro/e-mail — a sessão já troca para a empresa recém-criada.
  async createAdditionalOrganization(userId: string, organizationName: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      throw new NotFoundError('Usuário')
    }

    const organization = await this.createOrganizationWithTrial(organizationName)

    await prisma.membership.create({
      data: { userId, organizationId: organization.id, orgRole: OrgRole.OWNER },
    })

    return this.issueSession(user, { organizationId: organization.id, orgRole: OrgRole.OWNER })
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
        failedLoginAttempts: 0,
        lockedUntil: null,
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

  // organizationId/orgRole vêm da sessão ativa (JWT), não necessariamente
  // da empresa "padrão" do usuário (User.organizationId) — depois de uma
  // troca de unidade, é a organização atual que precisa aparecer aqui.
  async me(userId: string, organizationId: string, orgRole: OrgRole) {
    const [user, organization, memberships] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          avatar: true,
          phone: true,
          isPlatformAdmin: true,
          createdAt: true,
        },
      }),
      prisma.organization.findUnique({
        where: { id: organizationId },
        include: { subscription: { include: { plan: true } } },
      }),
      prisma.membership.findMany({
        where: { userId },
        include: { organization: true },
        orderBy: { createdAt: 'asc' },
      }),
    ])

    if (!user) {
      throw new NotFoundError('Usuário')
    }

    return {
      ...user,
      organizationId,
      orgRole,
      organization,
      organizations: memberships.map((m) => ({
        id: m.organizationId,
        name: m.organization.name,
        slug: m.organization.slug,
        orgRole: m.orgRole,
      })),
    }
  }
}
