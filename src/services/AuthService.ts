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
