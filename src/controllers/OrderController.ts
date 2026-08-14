import { Request, Response } from 'express'
import { z } from 'zod'

import { OrderService } from '../services/OrderService'
import { PdfService, formatCurrency, formatDate } from '../services/PdfService'
import { getPagination, successResponse } from '../utils/pagination'
import { prisma } from '../config/prisma'
import {
  OrderOrigin,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
  OrderType,
} from '@prisma/client'

const orderService = new OrderService()
const pdfService = new PdfService()

const typeLabels: Record<string, string> = {
  DELIVERY: 'Entrega',
  PICKUP: 'Retirada',
}

const statusLabels: Record<string, string> = {
  CREATED: 'Criado',
  CONFIRMED: 'Confirmado',
  IN_PREPARATION: 'Em preparo',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  DELIVERED: 'Entregue',
  CANCELED: 'Cancelado',
}

const paymentMethodLabels: Record<string, string> = {
  PIX: 'PIX',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
  CASH: 'Dinheiro',
  BANK_TRANSFER: 'Transferência',
  ONLINE: 'Online',
  OTHER: 'Outro',
}

const paymentStatusLabels: Record<string, string> = {
  PENDING: 'A receber',
  PAID: 'Pago',
  REFUNDED: 'Estornado',
}

const orderItemSchema = z.object({
  productId: z.string().optional(),
  name: z.string().min(1),
  quantity: z.coerce.number().int().positive(),
  unitPrice: z.coerce.number().nonnegative(),
})

const createOrderSchema = z.object({
  contactId: z.string().optional(),
  customerName: z.string().min(2, 'Informe o nome do cliente'),
  customerPhone: z.string().optional(),
  type: z.nativeEnum(OrderType).optional(),
  status: z.nativeEnum(OrderStatus).optional(),
  origin: z.nativeEnum(OrderOrigin).optional(),
  paymentMethod: z.nativeEnum(OrderPaymentMethod).optional(),
  paymentStatus: z.nativeEnum(OrderPaymentStatus).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  notes: z.string().optional(),
  scheduledAt: z.coerce.date().optional(),
  items: z.array(orderItemSchema).min(1, 'Adicione ao menos um item ao pedido'),
})

const updateOrderSchema = createOrderSchema.partial().extend({
  items: z.array(orderItemSchema).optional(),
})

const updateStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
})

export class OrderController {
  async create(req: Request, res: Response): Promise<void> {
    const data = createOrderSchema.parse(req.body)
    const order = await orderService.create(req.user!.organizationId, req.user!.id, data)
    res.status(201).json(successResponse(order, 'Pedido criado com sucesso'))
  }

  async list(req: Request, res: Response): Promise<void> {
    const pagination = getPagination(req)

    const filter = {
      status: req.query.status as OrderStatus | undefined,
      type: req.query.type as OrderType | undefined,
      origin: req.query.origin as OrderOrigin | undefined,
      search: req.query.search as string | undefined,
      from: req.query.from ? new Date(String(req.query.from)) : undefined,
      to: req.query.to ? new Date(String(req.query.to)) : undefined,
    }

    const result = await orderService.findAll(req.user!.organizationId, filter, pagination)
    res.status(200).json(successResponse(result))
  }

  async getById(req: Request, res: Response): Promise<void> {
    const order = await orderService.findById(req.user!.organizationId, String(req.params.id))
    res.status(200).json(successResponse(order))
  }

  async update(req: Request, res: Response): Promise<void> {
    const data = updateOrderSchema.parse(req.body)
    const order = await orderService.update(req.user!.organizationId, String(req.params.id), data)
    res.status(200).json(successResponse(order, 'Pedido atualizado com sucesso'))
  }

  async updateStatus(req: Request, res: Response): Promise<void> {
    const { status } = updateStatusSchema.parse(req.body)
    const order = await orderService.updateStatus(req.user!.organizationId, String(req.params.id), status)
    res.status(200).json(successResponse(order, 'Status do pedido atualizado'))
  }

  async delete(req: Request, res: Response): Promise<void> {
    await orderService.delete(req.user!.organizationId, String(req.params.id))
    res.status(204).send()
  }

  async generatePdf(req: Request, res: Response): Promise<void> {
    const order = await orderService.findById(req.user!.organizationId, String(req.params.id))
    const organization = await prisma.organization.findUnique({
      where: { id: req.user!.organizationId },
    })

    pdfService.streamDocument(res, `pedido-${order.id}.pdf`, (doc) => {
      pdfService.header(doc, organization?.name || 'ATHLO', 'Pedido')

      pdfService.field(doc, 'Cliente:', order.customerName)
      if (order.customerPhone) pdfService.field(doc, 'Telefone:', order.customerPhone)
      pdfService.field(doc, 'Tipo:', typeLabels[order.type] || order.type)
      pdfService.field(doc, 'Status:', statusLabels[order.status] || order.status)
      pdfService.field(
        doc,
        'Pagamento:',
        `${paymentMethodLabels[order.paymentMethod] || order.paymentMethod} — ${
          paymentStatusLabels[order.paymentStatus] || order.paymentStatus
        }`,
      )
      if (order.scheduledAt) pdfService.field(doc, 'Agendado para:', formatDate(order.scheduledAt))

      if (order.type === 'DELIVERY' && order.address) {
        const addressParts = [order.address, order.city, order.state, order.zipCode]
          .filter(Boolean)
          .join(', ')
        pdfService.field(doc, 'Endereço de entrega:', addressParts)
      }

      doc.moveDown(0.5)
      doc.fontSize(11).fillColor('#0f172a').text('Itens do pedido', { underline: true })
      doc.moveDown(0.3)

      order.items.forEach((item) => {
        doc
          .fontSize(10)
          .fillColor('#0f172a')
          .text(
            `${item.quantity}x ${item.name} — ${formatCurrency(item.unitPrice)} = ${formatCurrency(item.total)}`,
          )
      })

      doc.moveDown(0.5)
      doc
        .strokeColor('#e2e8f0')
        .moveTo(doc.x, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .stroke()
      doc.moveDown(0.5)

      doc.fontSize(13).fillColor('#0891b2').text(`Total: ${formatCurrency(order.total)}`)

      if (order.notes) {
        doc.moveDown(0.8)
        pdfService.field(doc, 'Observações:', order.notes)
      }

      doc.moveDown(1.5)
      doc
        .fontSize(8)
        .fillColor('#94a3b8')
        .text(`Gerado em ${formatDate(new Date())} — ATHLO`, { align: 'center' })
    })
  }
}
