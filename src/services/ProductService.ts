import { prisma } from '../config/prisma'
import { NotFoundError } from '../utils/AppError'
import { paginate, PaginationParams } from '../utils/pagination'
import { ProductType } from '@prisma/client'
import { AuditLogService } from './AuditLogService'

const auditLogService = new AuditLogService()

interface CreateProductInput {
  name: string
  description?: string
  sku?: string
  type?: ProductType
  price: number
  active?: boolean
}

type UpdateProductInput = Partial<CreateProductInput>

interface ListProductsFilter {
  type?: ProductType
  active?: boolean
  search?: string
}

export class ProductService {
  async create(organizationId: string, input: CreateProductInput, userId?: string) {
    const product = await prisma.product.create({
      data: { ...input, organizationId },
    })

    void auditLogService.record({
      organizationId,
      userId,
      entityType: 'Product',
      entityId: product.id,
      action: 'CREATE',
      summary: `Produto "${product.name}" criado`,
    })

    return product
  }

  async findAll(
    organizationId: string,
    filter: ListProductsFilter,
    pagination: PaginationParams,
  ) {
    const where = {
      organizationId,
      ...(filter.type && { type: filter.type }),
      ...(filter.active !== undefined && { active: filter.active }),
      ...(filter.search && {
        name: { contains: filter.search, mode: 'insensitive' as const },
      }),
    }

    const [products, total, totalAll, activeCount, servicesCount] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.product.count({ where }),
      // Resumo sempre da organização inteira, igual ao de Faturas — não
      // faz sentido o indicador "ativos" sumir quando alguém busca por nome.
      prisma.product.count({ where: { organizationId } }),
      prisma.product.count({ where: { organizationId, active: true } }),
      prisma.product.count({ where: { organizationId, type: ProductType.SERVICE } }),
    ])

    return {
      ...paginate(products, total, pagination),
      summary: { total: totalAll, active: activeCount, services: servicesCount },
    }
  }

  async findById(organizationId: string, id: string) {
    const product = await prisma.product.findFirst({ where: { id, organizationId } })

    if (!product) {
      throw new NotFoundError('Produto')
    }

    return product
  }

  async update(organizationId: string, id: string, input: UpdateProductInput, userId?: string) {
    await this.findById(organizationId, id)
    const product = await prisma.product.update({ where: { id }, data: input })

    void auditLogService.record({
      organizationId,
      userId,
      entityType: 'Product',
      entityId: product.id,
      action: 'UPDATE',
      summary: `Produto "${product.name}" atualizado`,
    })

    return product
  }

  async delete(organizationId: string, id: string, userId?: string) {
    const existing = await this.findById(organizationId, id)
    await prisma.product.delete({ where: { id } })

    void auditLogService.record({
      organizationId,
      userId,
      entityType: 'Product',
      entityId: id,
      action: 'DELETE',
      summary: `Produto "${existing.name}" excluído`,
    })
  }
}
