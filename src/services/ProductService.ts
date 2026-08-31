import { prisma } from '../config/prisma'
import { NotFoundError } from '../utils/AppError'
import { paginate, PaginationParams } from '../utils/pagination'
import { ProductType } from '@prisma/client'

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
  async create(organizationId: string, input: CreateProductInput) {
    return prisma.product.create({
      data: { ...input, organizationId },
    })
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

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.product.count({ where }),
    ])

    return paginate(products, total, pagination)
  }

  async findById(organizationId: string, id: string) {
    const product = await prisma.product.findFirst({ where: { id, organizationId } })

    if (!product) {
      throw new NotFoundError('Produto')
    }

    return product
  }

  async update(organizationId: string, id: string, input: UpdateProductInput) {
    await this.findById(organizationId, id)
    return prisma.product.update({ where: { id }, data: input })
  }

  async delete(organizationId: string, id: string) {
    await this.findById(organizationId, id)
    await prisma.product.delete({ where: { id } })
  }
}
