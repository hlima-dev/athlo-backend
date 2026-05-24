import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { UnauthorizedError, ForbiddenError } from '../utils/AppError'
import { UserRole } from '@prisma/client'

interface JwtPayload {
  sub: string
  role: UserRole
  iat: number
  exp: number
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        role: UserRole
      }
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authorization = req.headers.authorization

  if (!authorization || !authorization.startsWith('Bearer ')) {
    throw new UnauthorizedError('Token de autenticação não fornecido')
  }

  const token = authorization.split(' ')[1]

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload
    req.user = {
      id: decoded.sub,
      role: decoded.role,
    }
    next()
  } catch {
    throw new UnauthorizedError('Token inválido ou expirado')
  }
}

export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError()
    }

    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError(
        `Acesso restrito para: ${roles.join(', ')}`,
      )
    }

    next()
  }
}
