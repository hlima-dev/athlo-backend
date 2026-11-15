import { AuditAction, EventRecurrence } from '@prisma/client'
import { prisma } from '../config/prisma'
import { NotFoundError } from '../utils/AppError'
import { AuditLogService } from './AuditLogService'

const auditLogService = new AuditLogService()

// Mantém sempre essa quantidade de semanas futuras geradas a partir de
// hoje — rodar o gerador diariamente garante um buffer constante sem
// precisar de um "está acabando, gera mais" separado.
const RECURRENCE_HORIZON_WEEKS = 8
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const WEEKDAY_LABELS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
]

export class EventRecurrenceService {
  // "Tornar recorrente": monta o molde a partir do compromisso de origem
  // e já gera as primeiras ocorrências na hora, sem esperar o cron.
  async create(organizationId: string, eventId: string, userId: string): Promise<EventRecurrence> {
    const event = await prisma.event.findFirst({
      where: { id: eventId, organizationId },
    })
    if (!event) throw new NotFoundError('Evento')

    if (event.recurrenceId) {
      const existing = await prisma.eventRecurrence.findFirst({
        where: { id: event.recurrenceId, organizationId },
      })
      if (existing?.active) return existing
    }

    const recurrence = await prisma.eventRecurrence.create({
      data: {
        organizationId,
        title: event.title,
        description: event.description,
        type: event.type,
        location: event.location,
        isOnline: event.isOnline,
        onlineUrl: event.onlineUrl,
        allDay: event.allDay,
        dayOfWeek: event.startDate.getUTCDay(),
        startHour: event.startDate.getUTCHours(),
        startMinute: event.startDate.getUTCMinutes(),
        durationMinutes: Math.round((event.endDate.getTime() - event.startDate.getTime()) / 60000),
        contactId: event.contactId,
        assignedToId: event.assignedToId,
        createdById: userId,
      },
    })

    // A origem passa a carregar o recurrenceId antes de gerar as próximas
    // ocorrências — assim ensureUpcomingOccurrences a encontra como "última
    // ocorrência" já na primeira chamada, sem precisar de um caso especial.
    await prisma.event.update({ where: { id: event.id }, data: { recurrenceId: recurrence.id } })

    await this.ensureUpcomingOccurrences(recurrence)

    void auditLogService.record({
      organizationId,
      userId,
      entityType: 'Event',
      entityId: event.id,
      action: AuditAction.UPDATE,
      summary: `Compromisso "${event.title}" marcado como recorrente (toda ${WEEKDAY_LABELS[recurrence.dayOfWeek]})`,
    })

    return recurrence
  }

  // "Parar rotina": só impede novas ocorrências — nunca apaga as já geradas.
  async deactivate(organizationId: string, eventId: string, userId: string): Promise<EventRecurrence> {
    const event = await prisma.event.findFirst({ where: { id: eventId, organizationId } })
    if (!event?.recurrenceId) throw new NotFoundError('Rotina')

    const recurrence = await prisma.eventRecurrence.findFirst({
      where: { id: event.recurrenceId, organizationId },
    })
    if (!recurrence) throw new NotFoundError('Rotina')

    const updated = recurrence.active
      ? await prisma.eventRecurrence.update({ where: { id: recurrence.id }, data: { active: false } })
      : recurrence

    void auditLogService.record({
      organizationId,
      userId,
      entityType: 'Event',
      entityId: event.id,
      action: AuditAction.UPDATE,
      summary: `Rotina do compromisso "${event.title}" foi parada`,
    })

    return updated
  }

  // Compartilhada entre "Tornar recorrente" (gera já na hora) e o script do
  // cron (gera o buffer de todo mundo todo dia). Idempotente: sempre parte
  // da última ocorrência real encontrada no banco, então rodar de novo sem
  // o horizonte ter avançado não cria nada.
  async ensureUpcomingOccurrences(recurrence: EventRecurrence): Promise<number> {
    const latest = await prisma.event.findFirst({
      where: { recurrenceId: recurrence.id },
      orderBy: { startDate: 'desc' },
    })
    if (!latest) return 0

    const horizon = new Date(Date.now() + RECURRENCE_HORIZON_WEEKS * WEEK_MS)

    let cursorStart = latest.startDate
    let created = 0

    while (new Date(cursorStart.getTime() + WEEK_MS) <= horizon) {
      const nextStart = new Date(cursorStart.getTime() + WEEK_MS)
      const nextEnd = new Date(nextStart.getTime() + recurrence.durationMinutes * 60 * 1000)

      await prisma.event.create({
        data: {
          organizationId: recurrence.organizationId,
          title: recurrence.title,
          description: recurrence.description,
          type: recurrence.type,
          location: recurrence.location,
          isOnline: recurrence.isOnline,
          onlineUrl: recurrence.onlineUrl,
          allDay: recurrence.allDay,
          startDate: nextStart,
          endDate: nextEnd,
          contactId: recurrence.contactId,
          assignedToId: recurrence.assignedToId,
          createdById: recurrence.createdById,
          recurrenceId: recurrence.id,
        },
      })

      cursorStart = nextStart
      created++
    }

    return created
  }

  // Usada só pelo script do cron — gera o buffer de toda rotina ativa de
  // toda organização, uma falha isolada não trava as outras.
  async generateForAllActive(): Promise<number> {
    const recurrences = await prisma.eventRecurrence.findMany({ where: { active: true } })

    let total = 0
    for (const recurrence of recurrences) {
      try {
        total += await this.ensureUpcomingOccurrences(recurrence)
      } catch (err) {
        console.error(`Falha ao gerar ocorrências da rotina ${recurrence.id} ("${recurrence.title}"):`, err)
      }
    }

    return total
  }
}
