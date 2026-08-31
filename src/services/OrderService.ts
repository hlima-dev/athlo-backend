import { prisma } from '../config/prisma'
import { NotFoundError, ValidationError } from '../utils/AppError'
import { paginate, PaginationParams } from '../utils/pagination'
import { EmailService } from './EmailService'
import {
  OrderOrigin,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
  OrderType,
} from '@prisma/client'

const emailService = new EmailService()

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
}

export class OrderService {
  async create(organizationId: string, operatorId: string, input: CreateOrderInput) {
    if (!input.items || input.items.length === 0) {
      throw new ValidationError('O pedido precisa ter ao menos um item')
    }

    const total = computeTotal(input.items)

    return prisma.order.create({
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
          create: input.items.map((item) => ({
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

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: orderInclude,
      }),
      prisma.order.count({ where }),
    ])

    return paginate(orders, total, pagination)
  }

  async findById(organizationId: string, id: string) {
    const order = await prisma.order.findFirst({
      where: { id, organizationId },
      include: orderInclude,
    })

    if (!order) {
      throw new NotFoundError('Pedido')
    }

    return order
  }

  async update(organizationId: string, id: string, input: UpdateOrderInput) {
    await this.findById(organizationId, id)

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

    if (input.items && input.items.length > 0) {
      data.total = computeTotal(input.items)
      await prisma.orderItem.deleteMany({ where: { orderId: id } })
      data.items = {
        create: input.items.map((item) => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.quantity * item.unitPrice,
        })),
      }
    }

    return prisma.order.update({
      where: { id },
      data,
      include: orderInclude,
    })
  }

  async updateStatus(organizationId: string, id: string, status: OrderStatus) {
    await this.findById(organizationId, id)

    const order = await prisma.order.update({
      where: { id },
      data: {
        status,
        ...(status === 'DELIVERED' && { paymentStatus: 'PAID' }),
      },
      include: orderInclude,
    })

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

  async delete(organizationId: string, id: string) {
    await this.findById(organizationId, id)
    await prisma.order.delete({ where: { id } })
  }
}
