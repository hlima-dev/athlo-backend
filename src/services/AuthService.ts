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
import { UserRole } from '@prisma/client'
import { EmailService } from './EmailService'

interface RegisterInput {
  name: string
  email: string
  password: string
  role?: UserRole
  phone?: string
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

export class AuthService {
  async register(input: RegisterInput) {
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    })

    if (existing) {
      throw new ConflictError('E-mail já cadastrado')
    }

    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS)

    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        password: passwordHash,
        role: input.role ?? UserRole.VOLUNTEER,
        phone: input.phone,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    })

    const tokens = generateTokenPair({ sub: user.id, role: user.role })

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken },
    })

    return { user, ...tokens }
  }

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
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

    const tokens = generateTokenPair({ sub: user.id, role: user.role })

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken },
    })

    const { password: _, refreshToken: __, ...safeUser } = user

    return { user: safeUser, ...tokens }
  }

  async refreshToken(token: string) {
    const payload = verifyRefreshToken(token)

    const user = await prisma.user.findFirst({
      where: { id: payload.sub, refreshToken: token },
    })

    if (!user) {
      throw new UnauthorizedError('Refresh token inválido ou revogado')
    }

    const tokens = generateTokenPair({ sub: user.id, role: user.role })

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

  async me(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        avatar: true,
        phone: true,
        createdAt: true,
        athlete: {
          select: {
            id: true,
            sport: true,
            classification: true,
            status: true,
          },
        },
      },
    })

    if (!user) {
      throw new NotFoundError('Usuário')
    }

    return user
  }
}
