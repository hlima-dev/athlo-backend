import { prisma } from '../config/prisma'
import { ValidationError } from './AppError'

// Garante que um contactId/assignedToId recebido do cliente pertence à
// mesma organização de quem está autenticado — sem isso, um ID válido de
// outra organização (adivinhado ou vazado) ficaria vinculado ao registro
// de quem não deveria nem ver aquele contato/usuário.
export async function assertContactBelongsToOrg(organizationId: string, contactId?: string | null): Promise<void> {
  if (!contactId) return
  const contact = await prisma.contact.findFirst({ where: { id: contactId, organizationId }, select: { id: true } })
  if (!contact) {
    throw new ValidationError('Contato informado não pertence a esta organização.')
  }
}

export async function assertUserBelongsToOrg(organizationId: string, userId?: string | null): Promise<void> {
  if (!userId) return
  const membership = await prisma.membership.findFirst({ where: { userId, organizationId }, select: { id: true } })
  if (!membership) {
    throw new ValidationError('Usuário informado não pertence a esta organização.')
  }
}
