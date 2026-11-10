import { prisma } from '../config/prisma'
import { ConflictError, NotFoundError } from '../utils/AppError'
import { paginate, PaginationParams } from '../utils/pagination'
import { ContactStatus, ContactType } from '@prisma/client'
import { AuditLogService } from './AuditLogService'

const auditLogService = new AuditLogService()

interface CreateContactInput {
  name: string
  email?: string
  phone?: string
  document?: string
  company?: string
  type?: ContactType
  status?: ContactStatus
  address?: string
  city?: string
  state?: string
  zipCode?: string
  tags?: string[]
  notes?: string
}

type UpdateContactInput = Partial<CreateContactInput>

interface ListContactsFilter {
  type?: ContactType
  status?: ContactStatus
  search?: string
}

export class ContactService {
  async create(organizationId: string, input: CreateContactInput, userId?: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
      include: { plan: true },
    })

    if (subscription?.plan) {
      const contactsCount = await prisma.contact.count({ where: { organizationId } })
      if (contactsCount >= subscription.plan.maxContacts) {
        throw new ConflictError(
          `Seu plano permite até ${subscription.plan.maxContacts} contatos. Faça upgrade para cadastrar mais.`,
        )
      }
    }

    const { tags, ...rest } = input

    const contact = await prisma.contact.create({
      data: {
        ...rest,
        organizationId,
        tags: tags ? JSON.stringify(tags) : undefined,
      },
    })

    void auditLogService.record({
      organizationId,
      userId,
      entityType: 'Contact',
      entityId: contact.id,
      action: 'CREATE',
      summary: `Contato "${contact.name}" criado`,
    })

    return contact
  }

  async findAll(
    organizationId: string,
    filter: ListContactsFilter,
    pagination: PaginationParams,
  ) {
    const where = {
      organizationId,
      ...(filter.type && { type: filter.type }),
      ...(filter.status && { status: filter.status }),
      ...(filter.search && {
        OR: [
          { name: { contains: filter.search, mode: 'insensitive' as const } },
          { email: { contains: filter.search, mode: 'insensitive' as const } },
          { company: { contains: filter.search, mode: 'insensitive' as const } },
        ],
      }),
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.contact.count({ where }),
    ])

    return paginate(contacts, total, pagination)
  }

  async findById(organizationId: string, id: string) {
    const contact = await prisma.contact.findFirst({
      where: { id, organizationId },
      include: {
        invoices: { orderBy: { dueDate: 'desc' }, take: 20 },
        events: { orderBy: { startDate: 'desc' }, take: 20 },
      },
    })

    if (!contact) {
      throw new NotFoundError('Contato')
    }

    return contact
  }

  async update(organizationId: string, id: string, input: UpdateContactInput, userId?: string) {
    await this.findById(organizationId, id)
    const { tags, ...rest } = input

    const contact = await prisma.contact.update({
      where: { id },
      data: {
        ...rest,
        ...(tags && { tags: JSON.stringify(tags) }),
      },
    })

    void auditLogService.record({
      organizationId,
      userId,
      entityType: 'Contact',
      entityId: contact.id,
      action: 'UPDATE',
      summary: `Contato "${contact.name}" atualizado`,
    })

    return contact
  }

  async delete(organizationId: string, id: string, userId?: string) {
    const existing = await this.findById(organizationId, id)
    await prisma.contact.delete({ where: { id } })

    void auditLogService.record({
      organizationId,
      userId,
      entityType: 'Contact',
      entityId: id,
      action: 'DELETE',
      summary: `Contato "${existing.name}" excluído`,
    })
  }
}
