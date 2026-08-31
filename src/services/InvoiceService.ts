import { prisma } from '../config/prisma'
import { NotFoundError } from '../utils/AppError'
import { paginate, PaginationParams } from '../utils/pagination'
import { InvoiceMethod, InvoiceStatus, InvoiceType } from '@prisma/client'

interface CreateInvoiceInput {
  type?: InvoiceType
  description: string
  amount: number
  dueDate: Date
  status?: InvoiceStatus
  method?: InvoiceMethod
  notes?: string
  contactId?: string
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
    return prisma.invoice.create({
      data: { ...input, organizationId, createdById },
      include: { contact: { select: { id: true, name: true } } },
    })
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

  async update(organizationId: string, id: string, input: UpdateInvoiceInput) {
    await this.findById(organizationId, id)

    return prisma.invoice.update({
      where: { id },
      data: input,
      include: { contact: { select: { id: true, name: true } } },
    })
  }

  async markPaid(organizationId: string, id: string, method?: InvoiceMethod) {
    await this.findById(organizationId, id)

    return prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.PAID, paidAt: new Date(), ...(method && { method }) },
    })
  }

  async delete(organizationId: string, id: string) {
    await this.findById(organizationId, id)
    await prisma.invoice.delete({ where: { id } })
  }
}
