import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { UnauthorizedError, ForbiddenError } from '../utils/AppError'
import { OrgRole } from '@prisma/client'

interface JwtPayload {
  sub: string
  organizationId: string
  orgRole: OrgRole
  iat: number
  exp: number
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        organizationId: string
        orgRole: OrgRole
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
      organizationId: decoded.organizationId,
      orgRole: decoded.orgRole,
    }
    next()
  } catch {
    throw new UnauthorizedError('Token inválido ou expirado')
  }
}

// Garante que o :id do recurso pertence à organização do usuário autenticado.
// Usado nos services (findFirst com organizationId) — aqui só documentamos o contrato.
export function authorize(...roles: OrgRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError()
    }

    if (!roles.includes(req.user.orgRole)) {
      throw new ForbiddenError(
        `Acesso restrito para: ${roles.join(', ')}`,
      )
    }

    next()
  }
}
