import { prisma } from '../config/prisma'
import { ConflictError, NotFoundError } from '../utils/AppError'
import { paginate, PaginationParams } from '../utils/pagination'
import { assertContactBelongsToOrg } from '../utils/tenantValidation'
import { InvoiceMethod, InvoiceStatus, InvoiceType } from '@prisma/client'
import { AuditLogService } from './AuditLogService'

const auditLogService = new AuditLogService()

interface CreateInvoiceInput {
  type?: InvoiceType
  description: string
  amount: number
  dueDate: Date
  status?: InvoiceStatus
  method?: InvoiceMethod
  notes?: string
  contactId?: string
  accessKey?: string
}

type UpdateInvoiceInput = Partial<CreateInvoiceInput>

interface ListInvoicesFilter {
  type?: InvoiceType
  status?: InvoiceStatus
  contactId?: string
  search?: string
}

export class InvoiceService {
  async create(organizationId: string, createdById: string, input: CreateInvoiceInput) {
    await assertContactBelongsToOrg(organizationId, input.contactId)

    if (input.accessKey) {
      const existing = await prisma.invoice.findFirst({
        where: { organizationId, accessKey: input.accessKey },
      })
      if (existing) {
        throw new ConflictError('Essa nota fiscal já foi importada anteriormente.')
      }
    }

    const invoice = await prisma.invoice.create({
      data: { ...input, organizationId, createdById },
      include: { contact: { select: { id: true, name: true } } },
    })

    void auditLogService.record({
      organizationId,
      userId: createdById,
      entityType: 'Invoice',
      entityId: invoice.id,
      action: 'CREATE',
      summary: `Fatura "${invoice.description}" criada`,
    })

    return invoice
  }

  async findAll(
    organizationId: string,
    filter: ListInvoicesFilter,
    pagination: PaginationParams,
  ) {
    const where = {
      organizationId,
      ...(filter.type && { type: filter.type }),
      ...(filter.status && { status: filter.status }),
      ...(filter.contactId && { contactId: filter.contactId }),
      ...(filter.search && {
        description: { contains: filter.search, mode: 'insensitive' as const },
      }),
    }

    const [invoices, total, summary] = await Promise.all([
      prisma.invoice.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { dueDate: 'asc' },
        include: { contact: { select: { id: true, name: true } } },
      }),
      prisma.invoice.count({ where }),
      prisma.invoice.groupBy({
        by: ['type', 'status'],
        where: { organizationId },
        _sum: { amount: true },
      }),
    ])

    return { ...paginate(invoices, total, pagination), summary }
  }

  async findById(organizationId: string, id: string) {
    const invoice = await prisma.invoice.findFirst({
      where: { id, organizationId },
      include: { contact: { select: { id: true, name: true } } },
    })

    if (!invoice) {
      throw new NotFoundError('Fatura')
    }

    return invoice
  }

  async update(organizationId: string, id: string, input: UpdateInvoiceInput, userId?: string) {
    await this.findById(organizationId, id)
    await assertContactBelongsToOrg(organizationId, input.contactId)

    const invoice = await prisma.invoice.update({
      where: { id },
      data: input,
      include: { contact: { select: { id: true, name: true } } },
    })

    void auditLogService.record({
      organizationId,
      userId,
      entityType: 'Invoice',
      entityId: invoice.id,
      action: 'UPDATE',
      summary: `Fatura "${invoice.description}" atualizada`,
    })

    return invoice
  }

  async markPaid(organizationId: string, id: string, method?: InvoiceMethod, userId?: string) {
    const existing = await this.findById(organizationId, id)

    const invoice = await prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.PAID, paidAt: new Date(), ...(method && { method }) },
    })

    void auditLogService.record({
      organizationId,
      userId,
      entityType: 'Invoice',
      entityId: invoice.id,
      action: 'UPDATE',
      summary: `Fatura "${existing.description}" marcada como paga`,
    })

    return invoice
  }

  async delete(organizationId: string, id: string, userId?: string) {
    const existing = await this.findById(organizationId, id)
    await prisma.invoice.delete({ where: { id } })

    void auditLogService.record({
      organizationId,
      userId,
      entityType: 'Invoice',
      entityId: id,
      action: 'DELETE',
      summary: `Fatura "${existing.description}" excluída`,
    })
  }
}
