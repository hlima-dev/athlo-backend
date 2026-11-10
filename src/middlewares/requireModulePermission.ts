import { NextFunction, Request, Response } from 'express'
import { OrgModule, OrgRole } from '@prisma/client'
import { prisma } from '../config/prisma'
import { ForbiddenError, UnauthorizedError } from '../utils/AppError'

// Controle de acesso granular por módulo (Contatos/Financeiro/Produtos/
// Pedidos/Agenda), só relevante pra orgRole MEMBER — OWNER e ADMIN sempre
// têm acesso total a todo módulo, exatamente como já era antes dessa
// feature existir (zero mudança de comportamento pra esses dois papéis).
//
// Verifica no banco a cada requisição (igual requirePlatformAdmin, não
// igual authorize/orgRole, que fica em cache no JWT) porque uma mudança
// de permissão feita pelo ADMIN precisa valer na próxima requisição do
// membro, não só depois dele logar de novo.
export function requireModulePermission(module: OrgModule) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      throw new UnauthorizedError()
    }

    if (req.user.orgRole === OrgRole.OWNER || req.user.orgRole === OrgRole.ADMIN) {
      next()
      return
    }

    const permission = await prisma.modulePermission.findUnique({
      where: { userId_module: { userId: req.user.id, module } },
      select: { enabled: true },
    })

    if (!permission?.enabled) {
      throw new ForbiddenError(`Acesso restrito — peça liberação do módulo ${module} a um administrador`)
    }

    next()
  }
}
