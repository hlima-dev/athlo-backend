import { NextFunction, Request, Response } from 'express'
import { prisma } from '../config/prisma'
import { ForbiddenError, UnauthorizedError } from '../utils/AppError'

// Flag separada do orgRole — administra a plataforma ATHLO inteira
// (todos os tenants), não apenas a organização do próprio usuário.
export async function requirePlatformAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    throw new UnauthorizedError()
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { isPlatformAdmin: true },
  })

  if (!user?.isPlatformAdmin) {
    throw new ForbiddenError('Acesso restrito à administração da plataforma')
  }

  next()
}
