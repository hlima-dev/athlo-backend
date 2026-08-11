import { prisma } from '../config/prisma'
import { NotFoundError } from '../utils/AppError'

interface UpdateOrganizationInput {
  name?: string
  document?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
  logoUrl?: string
}

export class OrganizationService {
  async findById(id: string) {
    const organization = await prisma.organization.findUnique({
      where: { id },
      include: {
        subscription: { include: { plan: true } },
        _count: { select: { users: true, contacts: true } },
      },
    })

    if (!organization) {
      throw new NotFoundError('Empresa')
    }

    return organization
  }

  async update(id: string, input: UpdateOrganizationInput) {
    await this.findById(id)
    return prisma.organization.update({ where: { id }, data: input })
  }

  async listMembers(organizationId: string) {
    return prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        orgRole: true,
        status: true,
        avatar: true,
        phone: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })
  }
}
