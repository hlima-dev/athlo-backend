import { prisma } from '../config/prisma'
import { NotFoundError, ValidationError } from '../utils/AppError'
import { paginate, PaginationParams } from '../utils/pagination'
import { ProductType } from '@prisma/client'
import { AuditLogService } from './AuditLogService'
import { computeBestPrice, priceInclude, type PriceWithContact } from './InsumoService'

const auditLogService = new AuditLogService()

interface CreateProductInput {
  name: string
  description?: string
  sku?: string
  type?: ProductType
  price: number
  active?: boolean
  stockQty?: number | null
  lowStockThreshold?: number | null
  taxPercent?: number | null
  paymentFeePercent?: number | null
  shippingCost?: number | null
}

type UpdateProductInput = Partial<CreateProductInput>

interface ListProductsFilter {
  type?: ProductType
  active?: boolean
  search?: string
}

interface RecipeItemInput {
  insumoId: string
  quantity: number
}

export interface ProductMargin {
  productionCost: number
  taxAmount: number
  paymentFeeAmount: number
  shippingCost: number
  netMargin: number
  netMarginPercent: number
}

const recipeInclude = {
  recipeItems: {
    include: { insumo: { include: { prices: { include: priceInclude } } } },
  },
}

type RecipeItemWithInsumo = {
  id: string
  insumoId: string
  quantity: unknown
  insumo: { name: string; unit: string; prices: PriceWithContact[] }
}

// Soma, pra cada item da receita, a quantidade usada × o melhor preço
// vigente do insumo — insumo nunca cotado entra como custo 0 (não quebra
// o cálculo, só fica subestimado até alguém registrar uma cotação).
export function calculateProductionCost(recipeItems: RecipeItemWithInsumo[]): number {
  return recipeItems.reduce((sum, item) => {
    const best = computeBestPrice(item.insumo.prices)
    return sum + (best?.price ?? 0) * Number(item.quantity)
  }, 0)
}

// Decomposição do preço: preço de venda − custo de produção − imposto −
// taxa de pagamento − frete = margem líquida. "price" é genérico de
// propósito — o editor de Produtos usa o preço de catálogo, o Pedido usa
// o preço efetivamente cobrado naquela venda.
export function calculateMargin(input: {
  price: number
  productionCost: number
  taxPercent?: unknown
  paymentFeePercent?: unknown
  shippingCost?: unknown
}): ProductMargin {
  const { price, productionCost } = input
  const taxAmount = price * (Number(input.taxPercent ?? 0) / 100)
  const paymentFeeAmount = price * (Number(input.paymentFeePercent ?? 0) / 100)
  const shippingCost = Number(input.shippingCost ?? 0)
  const netMargin = price - productionCost - taxAmount - paymentFeeAmount - shippingCost
  const netMarginPercent = price > 0 ? (netMargin / price) * 100 : 0
  return { productionCost, taxAmount, paymentFeeAmount, shippingCost, netMargin, netMarginPercent }
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

    const [products, total, totalAll, activeCount, servicesCount, trackedStock] = await Promise.all([
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
      // Prisma não compara duas colunas entre si num where — busca os
      // rastreados (poucos, numa PME) e filtra em memória.
      prisma.product.findMany({
        where: { organizationId, active: true, stockQty: { not: null }, lowStockThreshold: { not: null } },
        select: { stockQty: true, lowStockThreshold: true },
      }),
    ])

    const lowStockCount = trackedStock.filter((p) => (p.stockQty ?? 0) <= (p.lowStockThreshold ?? 0)).length

    return {
      ...paginate(products, total, pagination),
      summary: { total: totalAll, active: activeCount, services: servicesCount, lowStock: lowStockCount },
    }
  }

  async findById(organizationId: string, id: string) {
    const product = await prisma.product.findFirst({
      where: { id, organizationId },
      include: recipeInclude,
    })

    if (!product) {
      throw new NotFoundError('Produto')
    }

    const { recipeItems, ...rest } = product
    const productionCost = calculateProductionCost(recipeItems)
    const margin = calculateMargin({
      price: Number(product.price),
      productionCost,
      taxPercent: product.taxPercent,
      paymentFeePercent: product.paymentFeePercent,
      shippingCost: product.shippingCost,
    })

    return {
      ...rest,
      recipeItems: recipeItems.map((item) => ({
        id: item.id,
        insumoId: item.insumoId,
        insumoName: item.insumo.name,
        unit: item.insumo.unit,
        quantity: item.quantity,
        unitCost: computeBestPrice(item.insumo.prices)?.price ?? null,
      })),
      margin,
    }
  }

  async updateRecipe(organizationId: string, productId: string, items: RecipeItemInput[], userId?: string) {
    const product = await this.assertExists(organizationId, productId)

    if (items.length > 0) {
      const insumoIds = [...new Set(items.map((item) => item.insumoId))]
      const validCount = await prisma.insumo.count({ where: { id: { in: insumoIds }, organizationId } })
      if (validCount !== insumoIds.length) {
        throw new ValidationError('Um ou mais insumos informados não pertencem a esta organização.')
      }
    }

    await prisma.$transaction([
      prisma.recipeItem.deleteMany({ where: { productId } }),
      prisma.recipeItem.createMany({
        data: items.map((item) => ({ productId, insumoId: item.insumoId, quantity: item.quantity })),
      }),
    ])

    void auditLogService.record({
      organizationId,
      userId,
      entityType: 'Product',
      entityId: productId,
      action: 'UPDATE',
      summary: `Ficha técnica de "${product.name}" atualizada`,
    })

    return this.findById(organizationId, productId)
  }

  private async assertExists(organizationId: string, id: string) {
    const product = await prisma.product.findFirst({ where: { id, organizationId } })
    if (!product) {
      throw new NotFoundError('Produto')
    }
    return product
  }

  async update(organizationId: string, id: string, input: UpdateProductInput, userId?: string) {
    await this.assertExists(organizationId, id)
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
    const existing = await this.assertExists(organizationId, id)
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
