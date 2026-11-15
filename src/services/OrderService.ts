import { prisma } from '../config/prisma'
import { NotFoundError, ValidationError } from '../utils/AppError'
import { paginate, PaginationParams } from '../utils/pagination'
import { assertContactBelongsToOrg } from '../utils/tenantValidation'
import { EmailService } from './EmailService'
import { AuditLogService } from './AuditLogService'
import { InvoiceService } from './InvoiceService'
import { calculateMargin, calculateProductionCost } from './ProductService'
import { priceInclude } from './InsumoService'
import {
  InvoiceStatus,
  InvoiceType,
  OrderOrigin,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
  OrderType,
  Prisma,
} from '@prisma/client'

const emailService = new EmailService()
const auditLogService = new AuditLogService()
const invoiceService = new InvoiceService()

const orderStatusLabels: Record<OrderStatus, string> = {
  CREATED: 'Criado',
  CONFIRMED: 'Confirmado',
  IN_PREPARATION: 'Em preparo',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  DELIVERED: 'Entregue',
  CANCELED: 'Cancelado',
}

interface OrderItemInput {
  productId?: string
  name: string
  quantity: number
  unitPrice: number
}

interface CreateOrderInput {
  contactId?: string
  customerName: string
  customerPhone?: string
  type?: OrderType
  status?: OrderStatus
  origin?: OrderOrigin
  paymentMethod?: OrderPaymentMethod
  paymentStatus?: OrderPaymentStatus
  address?: string
  city?: string
  state?: string
  zipCode?: string
  notes?: string
  scheduledAt?: Date
  items: OrderItemInput[]
}

type UpdateOrderInput = Partial<CreateOrderInput>

interface ListOrdersFilter {
  status?: OrderStatus
  type?: OrderType
  origin?: OrderOrigin
  search?: string
  from?: Date
  to?: Date
}

function computeTotal(items: OrderItemInput[]) {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
}

const orderInclude = {
  contact: { select: { id: true, name: true, phone: true, email: true } },
  operator: { select: { id: true, name: true } },
  items: { include: { product: { select: { id: true, name: true } } } },
  invoice: { select: { id: true } },
}

// Só usado por findAll/findById (exibição) — traz o suficiente da ficha
// técnica de cada produto vendido pra calcular o lucro estimado do item.
const orderIncludeWithMargin = {
  contact: { select: { id: true, name: true, phone: true, email: true } },
  operator: { select: { id: true, name: true } },
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          taxPercent: true,
          paymentFeePercent: true,
          shippingCost: true,
          recipeItems: {
            include: { insumo: { include: { prices: { include: priceInclude } } } },
          },
        },
      },
    },
  },
  invoice: { select: { id: true } },
}

type OrderWithMarginItems = Prisma.OrderGetPayload<{ include: typeof orderIncludeWithMargin }>

// Lucro estimado por item vendido = margem líquida por unidade (preço
// efetivamente cobrado no pedido, não o preço de catálogo) × quantidade.
// Nulo quando o produto não tem ficha técnica cadastrada ainda.
function attachEstimatedProfit(order: OrderWithMarginItems) {
  return {
    ...order,
    items: order.items.map((item) => {
      if (!item.product || item.product.recipeItems.length === 0) {
        return {
          ...item,
          product: item.product ? { id: item.product.id, name: item.product.name } : null,
          estimatedProfit: null as number | null,
        }
      }

      const productionCost = calculateProductionCost(item.product.recipeItems)
      const margin = calculateMargin({
        price: Number(item.unitPrice),
        productionCost,
        taxPercent: item.product.taxPercent,
        paymentFeePercent: item.product.paymentFeePercent,
        shippingCost: item.product.shippingCost,
      })

      return {
        ...item,
        product: { id: item.product.id, name: item.product.name },
        estimatedProfit: margin.netMargin * Number(item.quantity),
      }
    }),
  }
}

export class OrderService {
  // Debita (direction=-1) ou devolve (direction=1) o estoque dos produtos
  // rastreados (stockQty não nulo) usados pelos itens de um pedido. Produto
  // sem stockQty configurado é ignorado — continua sem controle de estoque.
  // Lança erro se uma baixa deixaria algum produto com estoque negativo.
  private async adjustStock(
    tx: Prisma.TransactionClient,
    items: { productId?: string | null; quantity: number }[],
    direction: 1 | -1,
  ) {
    const productIds = [...new Set(items.filter((item) => item.productId).map((item) => item.productId as string))]
    if (productIds.length === 0) return

    const trackedProducts = await tx.product.findMany({
      where: { id: { in: productIds }, stockQty: { not: null } },
      select: { id: true, name: true, stockQty: true },
    })
    if (trackedProducts.length === 0) return

    const byId = new Map(trackedProducts.map((product) => [product.id, product]))

    // Soma por produto (um pedido pode repetir o mesmo produto em mais de
    // uma linha).
    const quantityByProduct = new Map<string, number>()
    for (const item of items) {
      if (!item.productId || !byId.has(item.productId)) continue
      quantityByProduct.set(item.productId, (quantityByProduct.get(item.productId) ?? 0) + item.quantity)
    }

    if (direction === -1) {
      for (const [productId, quantity] of quantityByProduct) {
        const product = byId.get(productId)!
        if ((product.stockQty ?? 0) < quantity) {
          throw new ValidationError(
            `Estoque insuficiente para "${product.name}": disponível ${product.stockQty}, pedido precisa de ${quantity}`,
          )
        }
      }
    }

    for (const [productId, quantity] of quantityByProduct) {
      await tx.product.update({
        where: { id: productId },
        data: { stockQty: { increment: direction * quantity } },
      })
    }
  }

  // Gera a fatura (a receber, já paga) correspondente assim que o pedido
  // vira pago — sem isso, Pedidos e Financeiro ficam sem nenhuma ligação,
  // e quem fatura vários pedidos por dia precisa lançar cada um à parte
  // manualmente. Idempotente: não duplica se já existe fatura pro pedido.
  private async ensureInvoiceForPaidOrder(
    organizationId: string,
    order: { id: string; customerName: string; contactId: string | null; paymentStatus: OrderPaymentStatus; total: unknown },
    userId?: string,
  ) {
    if (order.paymentStatus !== OrderPaymentStatus.PAID || !userId) return

    const existing = await prisma.invoice.findUnique({ where: { orderId: order.id } })
    if (existing) return

    try {
      await invoiceService.create(organizationId, userId, {
        type: InvoiceType.RECEIVABLE,
        description: `Pedido de "${order.customerName}"`,
        amount: Number(order.total),
        dueDate: new Date(),
        status: InvoiceStatus.PAID,
        paidAt: new Date(),
        contactId: order.contactId ?? undefined,
        orderId: order.id,
      })
    } catch (err) {
      console.error('Erro ao gerar fatura automática do pedido:', err)
    }
  }

  async create(organizationId: string, operatorId: string, input: CreateOrderInput) {
    if (!input.items || input.items.length === 0) {
      throw new ValidationError('O pedido precisa ter ao menos um item')
    }

    await assertContactBelongsToOrg(organizationId, input.contactId)

    const total = computeTotal(input.items)

    const order = await prisma.$transaction(async (tx) => {
      if (input.status !== OrderStatus.CANCELED) {
        await this.adjustStock(tx, input.items!, -1)
      }

      return tx.order.create({
        data: {
          organizationId,
          operatorId,
          contactId: input.contactId,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          type: input.type,
          status: input.status,
          origin: input.origin,
          paymentMethod: input.paymentMethod,
          paymentStatus: input.paymentStatus,
          address: input.address,
          city: input.city,
          state: input.state,
          zipCode: input.zipCode,
          notes: input.notes,
          scheduledAt: input.scheduledAt,
          total,
          items: {
            create: input.items!.map((item) => ({
              productId: item.productId,
              name: item.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.quantity * item.unitPrice,
            })),
          },
        },
        include: orderInclude,
      })
    })

    void auditLogService.record({
      organizationId,
      userId: operatorId,
      entityType: 'Order',
      entityId: order.id,
      action: 'CREATE',
      summary: `Pedido de "${order.customerName}" criado`,
    })

    await this.ensureInvoiceForPaidOrder(organizationId, order, operatorId)

    return order
  }

  async findAll(organizationId: string, filter: ListOrdersFilter, pagination: PaginationParams) {
    const where = {
      organizationId,
      ...(filter.status && { status: filter.status }),
      ...(filter.type && { type: filter.type }),
      ...(filter.origin && { origin: filter.origin }),
      ...(filter.search && {
        OR: [
          { customerName: { contains: filter.search, mode: 'insensitive' as const } },
          { customerPhone: { contains: filter.search, mode: 'insensitive' as const } },
        ],
      }),
      ...((filter.from || filter.to) && {
        createdAt: {
          ...(filter.from && { gte: filter.from }),
          ...(filter.to && { lte: filter.to }),
        },
      }),
    }

    const [orders, total, openCount, deliveredCount, revenueAgg] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: orderIncludeWithMargin,
      }),
      prisma.order.count({ where }),
      // Os números abaixo respeitam o mesmo filtro da listagem (período,
      // status, busca) — ao contrário do resumo de Faturas, que é sempre
      // da organização inteira — porque aqui o filtro de período já é
      // parte central do fluxo (ex.: "pedidos deste mês").
      prisma.order.count({ where: { ...where, status: { notIn: [OrderStatus.DELIVERED, OrderStatus.CANCELED] } } }),
      prisma.order.count({ where: { ...where, status: OrderStatus.DELIVERED } }),
      prisma.order.aggregate({ where: { ...where, paymentStatus: OrderPaymentStatus.PAID }, _sum: { total: true } }),
    ])

    return {
      ...paginate(orders.map(attachEstimatedProfit), total, pagination),
      summary: {
        total,
        open: openCount,
        delivered: deliveredCount,
        revenue: Number(revenueAgg._sum.total ?? 0),
      },
    }
  }

  async findById(organizationId: string, id: string) {
    const order = await prisma.order.findFirst({
      where: { id, organizationId },
      include: orderIncludeWithMargin,
    })

    if (!order) {
      throw new NotFoundError('Pedido')
    }

    return attachEstimatedProfit(order)
  }

  // Versão leve (sem ficha técnica/margem) usada internamente por
  // update/updateStatus/delete — só precisam de status/itens pra lógica
  // de estoque e fatura, não do cálculo de lucro estimado.
  private async getRaw(organizationId: string, id: string) {
    const order = await prisma.order.findFirst({
      where: { id, organizationId },
      include: orderInclude,
    })

    if (!order) {
      throw new NotFoundError('Pedido')
    }

    return order
  }

  async update(organizationId: string, id: string, input: UpdateOrderInput, userId?: string) {
    const existing = await this.getRaw(organizationId, id)
    await assertContactBelongsToOrg(organizationId, input.contactId)

    const data: Record<string, unknown> = {
      contactId: input.contactId,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      type: input.type,
      status: input.status,
      origin: input.origin,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paymentStatus,
      address: input.address,
      city: input.city,
      state: input.state,
      zipCode: input.zipCode,
      notes: input.notes,
      scheduledAt: input.scheduledAt,
    }

    const itemsChanged = !!(input.items && input.items.length > 0)
    if (itemsChanged) {
      data.total = computeTotal(input.items!)
    }

    const existingStatus = existing.status
    const newStatus = input.status ?? existingStatus

    const order = await prisma.$transaction(async (tx) => {
      // Estoque reservado = pedido não cancelado. Só mexe no estoque
      // quando a reserva muda (itens mudaram enquanto não cancelado, ou
      // o status cruzou de/para CANCELED) — ver OrderService.adjustStock.
      if (existingStatus !== OrderStatus.CANCELED && newStatus !== OrderStatus.CANCELED) {
        if (itemsChanged) {
          await this.adjustStock(tx, existing.items, 1)
          await this.adjustStock(tx, input.items!, -1)
        }
      } else if (existingStatus !== OrderStatus.CANCELED && newStatus === OrderStatus.CANCELED) {
        await this.adjustStock(tx, existing.items, 1)
      } else if (existingStatus === OrderStatus.CANCELED && newStatus !== OrderStatus.CANCELED) {
        await this.adjustStock(tx, itemsChanged ? input.items! : existing.items, -1)
      }

      if (itemsChanged) {
        await tx.orderItem.deleteMany({ where: { orderId: id } })
        data.items = {
          create: input.items!.map((item) => ({
            productId: item.productId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
          })),
        }
      }

      return tx.order.update({ where: { id }, data, include: orderInclude })
    })

    void auditLogService.record({
      organizationId,
      userId,
      entityType: 'Order',
      entityId: order.id,
      action: 'UPDATE',
      summary: `Pedido de "${order.customerName}" atualizado`,
    })

    await this.ensureInvoiceForPaidOrder(organizationId, order, userId)

    return order
  }

  async updateStatus(organizationId: string, id: string, status: OrderStatus, userId?: string) {
    const existing = await this.getRaw(organizationId, id)

    const order = await prisma.$transaction(async (tx) => {
      if (existing.status !== OrderStatus.CANCELED && status === OrderStatus.CANCELED) {
        await this.adjustStock(tx, existing.items, 1)
      } else if (existing.status === OrderStatus.CANCELED && status !== OrderStatus.CANCELED) {
        await this.adjustStock(tx, existing.items, -1)
      }

      return tx.order.update({
        where: { id },
        data: {
          status,
          ...(status === 'DELIVERED' && { paymentStatus: 'PAID' }),
        },
        include: orderInclude,
      })
    })

    void auditLogService.record({
      organizationId,
      userId,
      entityType: 'Order',
      entityId: order.id,
      action: 'UPDATE',
      summary: `Pedido de "${order.customerName}" mudou para "${orderStatusLabels[status]}"`,
    })

    await this.ensureInvoiceForPaidOrder(organizationId, order, userId)

    if (order.contact?.email) {
      try {
        await emailService.sendOrderStatusUpdate(
          order.contact.email,
          order.contact.name,
          order.customerName,
          orderStatusLabels[status],
        )
      } catch (err) {
        console.error('Erro ao enviar e-mail de atualização de pedido:', err)
      }
    }

    return order
  }

  async delete(organizationId: string, id: string, userId?: string) {
    const existing = await this.getRaw(organizationId, id)

    await prisma.$transaction(async (tx) => {
      if (existing.status !== OrderStatus.CANCELED) {
        await this.adjustStock(tx, existing.items, 1)
      }
      await tx.order.delete({ where: { id } })
    })

    void auditLogService.record({
      organizationId,
      userId,
      entityType: 'Order',
      entityId: id,
      action: 'DELETE',
      summary: `Pedido de "${existing.customerName}" excluído`,
    })
  }
}
