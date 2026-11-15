import { prisma } from '../config/prisma'
import { NotFoundError } from '../utils/AppError'
import { paginate, PaginationParams } from '../utils/pagination'
import { assertContactBelongsToOrg } from '../utils/tenantValidation'
import { AuditLogService } from './AuditLogService'

const auditLogService = new AuditLogService()

interface CreateInsumoInput {
  name: string
  unit: string
  active?: boolean
}

type UpdateInsumoInput = Partial<CreateInsumoInput>

interface ListInsumosFilter {
  active?: boolean
  search?: string
}

interface AddInsumoPriceInput {
  contactId: string
  price: number
  isPromo?: boolean
  validUntil?: Date
}

interface BestPrice {
  price: number
  contactId: string
  contactName: string
}

type PriceWithContact = {
  contactId: string
  price: unknown
  isPromo: boolean
  validUntil: Date | null
  recordedAt: Date
  contact: { id: string; name: string }
}

const priceInclude = { contact: { select: { id: true, name: true } } }

// Entre todas as cotações já registradas, pega a mais recente por
// fornecedor (cada fornecedor "vale" só o último preço visto nele) e,
// dentre essas, a mais barata — ignorando promoção já vencida.
function computeBestPrice(prices: PriceWithContact[]): BestPrice | null {
  const now = new Date()
  const latestByContact = new Map<string, PriceWithContact>()
  for (const p of prices) {
    const current = latestByContact.get(p.contactId)
    if (!current || p.recordedAt > current.recordedAt) {
      latestByContact.set(p.contactId, p)
    }
  }

  const valid = [...latestByContact.values()].filter((p) => !p.isPromo || !p.validUntil || p.validUntil >= now)
  if (valid.length === 0) return null

  const cheapest = valid.reduce((min, p) => (Number(p.price) < Number(min.price) ? p : min))
  return { price: Number(cheapest.price), contactId: cheapest.contactId, contactName: cheapest.contact.name }
}

export class InsumoService {
  async create(organizationId: string, input: CreateInsumoInput, userId?: string) {
    const insumo = await prisma.insumo.create({ data: { ...input, organizationId } })

    void auditLogService.record({
      organizationId,
      userId,
      entityType: 'Insumo',
      entityId: insumo.id,
      action: 'CREATE',
      summary: `Insumo "${insumo.name}" criado`,
    })

    return insumo
  }

  async findAll(organizationId: string, filter: ListInsumosFilter, pagination: PaginationParams) {
    const where = {
      organizationId,
      ...(filter.active !== undefined && { active: filter.active }),
      ...(filter.search && {
        name: { contains: filter.search, mode: 'insensitive' as const },
      }),
    }

    const [insumos, total, totalAll, activeCount] = await Promise.all([
      prisma.insumo.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: { prices: { include: priceInclude } },
      }),
      prisma.insumo.count({ where }),
      // Resumo sempre da organização inteira, mesmo padrão de Produtos —
      // não some quando alguém busca por nome.
      prisma.insumo.count({ where: { organizationId } }),
      prisma.insumo.count({ where: { organizationId, active: true } }),
    ])

    const data = insumos.map(({ prices, ...insumo }) => ({
      ...insumo,
      bestPrice: computeBestPrice(prices),
    }))

    return {
      ...paginate(data, total, pagination),
      summary: { total: totalAll, active: activeCount },
    }
  }

  async findById(organizationId: string, id: string) {
    const insumo = await prisma.insumo.findFirst({
      where: { id, organizationId },
      include: { prices: { include: priceInclude, orderBy: { recordedAt: 'desc' } } },
    })

    if (!insumo) {
      throw new NotFoundError('Insumo')
    }

    return { ...insumo, bestPrice: computeBestPrice(insumo.prices) }
  }

  async update(organizationId: string, id: string, input: UpdateInsumoInput, userId?: string) {
    await this.assertExists(organizationId, id)
    const insumo = await prisma.insumo.update({ where: { id }, data: input })

    void auditLogService.record({
      organizationId,
      userId,
      entityType: 'Insumo',
      entityId: insumo.id,
      action: 'UPDATE',
      summary: `Insumo "${insumo.name}" atualizado`,
    })

    return insumo
  }

  async delete(organizationId: string, id: string, userId?: string) {
    const existing = await this.assertExists(organizationId, id)
    await prisma.insumo.delete({ where: { id } })

    void auditLogService.record({
      organizationId,
      userId,
      entityType: 'Insumo',
      entityId: id,
      action: 'DELETE',
      summary: `Insumo "${existing.name}" excluído`,
    })
  }

  async addPrice(organizationId: string, insumoId: string, input: AddInsumoPriceInput, userId?: string) {
    const insumo = await this.assertExists(organizationId, insumoId)
    await assertContactBelongsToOrg(organizationId, input.contactId)

    const price = await prisma.insumoPrice.create({
      data: {
        insumoId,
        contactId: input.contactId,
        price: input.price,
        isPromo: input.isPromo ?? false,
        validUntil: input.validUntil,
      },
      include: priceInclude,
    })

    void auditLogService.record({
      organizationId,
      userId,
      entityType: 'Insumo',
      entityId: insumoId,
      action: 'UPDATE',
      summary: `Cotação registrada pra "${insumo.name}": ${price.contact.name} — R$ ${Number(price.price).toFixed(2)}`,
    })

    return price
  }

  async listPrices(organizationId: string, insumoId: string) {
    await this.assertExists(organizationId, insumoId)

    return prisma.insumoPrice.findMany({
      where: { insumoId },
      include: priceInclude,
      orderBy: { recordedAt: 'desc' },
    })
  }

  private async assertExists(organizationId: string, id: string) {
    const insumo = await prisma.insumo.findFirst({ where: { id, organizationId } })
    if (!insumo) {
      throw new NotFoundError('Insumo')
    }
    return insumo
  }
}
