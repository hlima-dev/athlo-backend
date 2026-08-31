import { Request } from 'express'
import { prisma } from '../config/prisma'
import { PaginationParams, paginate } from '../utils/pagination'
import { NotFoundError } from '../utils/AppError'

interface ErrorLogFilter {
  resolved?: boolean
  search?: string
}

export class ErrorLogService {
  // Chamado pelo errorHandler — nunca deve derrubar a resposta original
  // se a própria gravação falhar (ex: banco fora do ar).
  async record(err: unknown, req: Request): Promise<void> {
    try {
      await prisma.errorLog.create({
        data: {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          statusCode: 500,
          method: req.method,
          path: req.originalUrl,
          userId: req.user?.id,
          organizationId: req.user?.organizationId,
        },
      })
    } catch (loggingError) {
      console.error('Falha ao gravar ErrorLog:', loggingError)
    }
  }

  async list(filter: ErrorLogFilter, pagination: PaginationParams) {
    const where = {
      ...(filter.resolved === true && { resolvedAt: { not: null } }),
      ...(filter.resolved === false && { resolvedAt: null }),
      ...(filter.search && {
        OR: [
          { message: { contains: filter.search, mode: 'insensitive' as const } },
          { path: { contains: filter.search, mode: 'insensitive' as const } },
        ],
      }),
    }

    const [logs, total] = await Promise.all([
      prisma.errorLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.errorLog.count({ where }),
    ])

    const data = await this.attachContext(logs)

    return paginate(data, total, pagination)
  }

  // Não guardamos nome/e-mail/empresa duplicados no log — busca em lote só
  // pra exibição, assim não fica desatualizado se o usuário mudar de nome.
  private async attachContext<T extends { userId: string | null; organizationId: string | null }>(
    logs: T[],
  ) {
    const userIds = [...new Set(logs.map((l) => l.userId).filter((id): id is string => !!id))]
    const orgIds = [...new Set(logs.map((l) => l.organizationId).filter((id): id is string => !!id))]

    const [users, organizations] = await Promise.all([
      userIds.length
        ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
        : [],
      orgIds.length
        ? prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })
        : [],
    ])

    const userMap = new Map(users.map((u) => [u.id, u]))
    const orgMap = new Map(organizations.map((o) => [o.id, o]))

    return logs.map((log) => ({
      ...log,
      user: log.userId ? userMap.get(log.userId) ?? null : null,
      organization: log.organizationId ? orgMap.get(log.organizationId) ?? null : null,
    }))
  }

  async unresolvedCount(): Promise<number> {
    return prisma.errorLog.count({ where: { resolvedAt: null } })
  }

  async resolve(id: string) {
    const log = await prisma.errorLog.findUnique({ where: { id } })
    if (!log) {
      throw new NotFoundError('Registro de erro')
    }

    return prisma.errorLog.update({
      where: { id },
      data: { resolvedAt: new Date() },
    })
  }
}
