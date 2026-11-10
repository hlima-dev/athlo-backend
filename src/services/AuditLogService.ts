import { AuditAction } from '@prisma/client'
import { prisma } from '../config/prisma'
import { PaginationParams, paginate } from '../utils/pagination'

interface AuditLogFilter {
  entityType?: string
  search?: string
}

export class AuditLogService {
  // Chamado pelos services de negócio depois de um create/update/delete
  // bem-sucedido — nunca deve derrubar a operação original se a própria
  // gravação do log falhar (mesmo espírito do ErrorLogService.record).
  async record(params: {
    organizationId: string
    userId?: string
    entityType: string
    entityId: string
    action: AuditAction
    summary: string
  }): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          organizationId: params.organizationId,
          userId: params.userId,
          entityType: params.entityType,
          entityId: params.entityId,
          action: params.action,
          summary: params.summary,
        },
      })
    } catch (loggingError) {
      console.error('Falha ao gravar AuditLog:', loggingError)
    }
  }

  async list(organizationId: string, filter: AuditLogFilter, pagination: PaginationParams) {
    const where = {
      organizationId,
      ...(filter.entityType && { entityType: filter.entityType }),
      ...(filter.search && {
        OR: [
          { summary: { contains: filter.search, mode: 'insensitive' as const } },
          { entityType: { contains: filter.search, mode: 'insensitive' as const } },
        ],
      }),
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.auditLog.count({ where }),
    ])

    const data = await this.attachContext(logs)

    return paginate(data, total, pagination)
  }

  // Não guardamos nome/e-mail de quem fez a ação no log — busca em lote
  // só pra exibição, assim não fica desatualizado se o usuário mudar de
  // nome depois (mesmo padrão do ErrorLogService.attachContext).
  private async attachContext<T extends { userId: string | null }>(logs: T[]) {
    const userIds = [...new Set(logs.map((l) => l.userId).filter((id): id is string => !!id))]

    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
      : []

    const userMap = new Map(users.map((u) => [u.id, u]))

    return logs.map((log) => ({
      ...log,
      user: log.userId ? userMap.get(log.userId) ?? null : null,
    }))
  }
}
