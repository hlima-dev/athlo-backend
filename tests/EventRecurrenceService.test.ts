import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventRecurrenceService } from '../src/services/EventRecurrenceService'

const mockPrisma = vi.hoisted(() => ({
  event: {
    findFirst: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  eventRecurrence: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
}))

vi.mock('../src/config/prisma', () => ({ prisma: mockPrisma }))
vi.mock('../src/services/AuditLogService', () => ({
  AuditLogService: class {
    record = vi.fn()
  },
}))

const eventRecurrenceService = new EventRecurrenceService()

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('EventRecurrenceService.create', () => {
  it('monta o molde a partir do compromisso de origem e já gera as ocorrências dentro do horizonte de 8 semanas', async () => {
    const now = new Date('2026-11-17T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    const originEvent = {
      id: 'event_1',
      organizationId: 'org_1',
      title: 'Venda de brigadeiro',
      description: null,
      type: 'MEETING',
      location: 'Feira',
      isOnline: false,
      onlineUrl: null,
      allDay: false,
      startDate: now,
      endDate: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      contactId: null,
      assignedToId: null,
      recurrenceId: null,
    }

    mockPrisma.event.findFirst
      .mockResolvedValueOnce(originEvent) // busca do evento de origem dentro de create()
      .mockResolvedValueOnce(originEvent) // "última ocorrência" dentro de ensureUpcomingOccurrences

    mockPrisma.eventRecurrence.create.mockResolvedValue({
      id: 'rec_1',
      organizationId: 'org_1',
      title: originEvent.title,
      description: null,
      type: 'MEETING',
      location: 'Feira',
      isOnline: false,
      onlineUrl: null,
      allDay: false,
      dayOfWeek: now.getUTCDay(),
      startHour: now.getUTCHours(),
      startMinute: now.getUTCMinutes(),
      durationMinutes: 120,
      contactId: null,
      assignedToId: null,
      createdById: 'user_1',
      active: true,
    })
    mockPrisma.event.update.mockResolvedValue({})
    mockPrisma.event.create.mockResolvedValue({})

    const recurrence = await eventRecurrenceService.create('org_1', 'event_1', 'user_1')

    expect(mockPrisma.eventRecurrence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org_1',
        title: 'Venda de brigadeiro',
        dayOfWeek: now.getUTCDay(),
        startHour: now.getUTCHours(),
        startMinute: now.getUTCMinutes(),
        durationMinutes: 120,
        createdById: 'user_1',
      }),
    })
    expect(mockPrisma.event.update).toHaveBeenCalledWith({
      where: { id: 'event_1' },
      data: { recurrenceId: 'rec_1' },
    })
    // now até now+8 semanas, uma ocorrência por semana = 8 novas linhas
    expect(mockPrisma.event.create).toHaveBeenCalledTimes(8)
    expect(recurrence.id).toBe('rec_1')
  })

  it('não cria uma segunda rotina se o evento já tem uma ativa', async () => {
    mockPrisma.event.findFirst.mockResolvedValueOnce({
      id: 'event_1',
      organizationId: 'org_1',
      recurrenceId: 'rec_1',
    })
    mockPrisma.eventRecurrence.findFirst.mockResolvedValue({ id: 'rec_1', active: true })

    const result = await eventRecurrenceService.create('org_1', 'event_1', 'user_1')

    expect(result.id).toBe('rec_1')
    expect(mockPrisma.eventRecurrence.create).not.toHaveBeenCalled()
  })
})

describe('EventRecurrenceService.ensureUpcomingOccurrences', () => {
  const recurrence = {
    id: 'rec_1',
    organizationId: 'org_1',
    title: 'Venda de brigadeiro',
    description: null,
    type: 'MEETING',
    location: null,
    isOnline: false,
    onlineUrl: null,
    allDay: false,
    dayOfWeek: 2,
    startHour: 12,
    startMinute: 0,
    durationMinutes: 120,
    contactId: null,
    assignedToId: null,
    createdById: 'user_1',
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as const

  it('é idempotente — rodar duas vezes seguidas não duplica nada dentro do mesmo horizonte', async () => {
    const now = new Date('2026-11-17T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    mockPrisma.event.findFirst.mockResolvedValueOnce({ id: 'event_origin', startDate: now })
    const created1 = await eventRecurrenceService.ensureUpcomingOccurrences(recurrence)
    expect(created1).toBe(8)
    expect(mockPrisma.event.create).toHaveBeenCalledTimes(8)

    mockPrisma.event.create.mockClear()

    // 2ª execução: a última ocorrência real já é a gerada no fim do
    // horizonte anterior — nenhuma data nova cabe dentro do horizonte ainda.
    mockPrisma.event.findFirst.mockResolvedValueOnce({
      id: 'event_last',
      startDate: new Date(now.getTime() + 8 * WEEK_MS),
    })
    const created2 = await eventRecurrenceService.ensureUpcomingOccurrences(recurrence)

    expect(created2).toBe(0)
    expect(mockPrisma.event.create).not.toHaveBeenCalled()
  })

  it('retorna 0 sem nenhum efeito quando não existe nenhuma ocorrência (nem a de origem)', async () => {
    mockPrisma.event.findFirst.mockResolvedValueOnce(null)

    const created = await eventRecurrenceService.ensureUpcomingOccurrences(recurrence)

    expect(created).toBe(0)
    expect(mockPrisma.event.create).not.toHaveBeenCalled()
  })
})

describe('EventRecurrenceService.deactivate', () => {
  it('marca a rotina como inativa sem apagar nenhum Event já gerado', async () => {
    mockPrisma.event.findFirst.mockResolvedValue({
      id: 'event_1',
      organizationId: 'org_1',
      recurrenceId: 'rec_1',
      title: 'Venda de brigadeiro',
    })
    mockPrisma.eventRecurrence.findFirst.mockResolvedValue({ id: 'rec_1', organizationId: 'org_1', active: true })
    mockPrisma.eventRecurrence.update.mockResolvedValue({ id: 'rec_1', active: false })

    const result = await eventRecurrenceService.deactivate('org_1', 'event_1', 'user_1')

    expect(mockPrisma.eventRecurrence.update).toHaveBeenCalledWith({
      where: { id: 'rec_1' },
      data: { active: false },
    })
    expect(result.active).toBe(false)
    // mockPrisma.event não tem "delete" mockado — se o serviço tentasse
    // apagar algum Event, essa chamada quebraria o teste.
  })

  it('é idempotente — desativar uma rotina já inativa não chama update de novo', async () => {
    mockPrisma.event.findFirst.mockResolvedValue({
      id: 'event_1',
      organizationId: 'org_1',
      recurrenceId: 'rec_1',
      title: 'Venda de brigadeiro',
    })
    mockPrisma.eventRecurrence.findFirst.mockResolvedValue({ id: 'rec_1', organizationId: 'org_1', active: false })

    const result = await eventRecurrenceService.deactivate('org_1', 'event_1', 'user_1')

    expect(mockPrisma.eventRecurrence.update).not.toHaveBeenCalled()
    expect(result.active).toBe(false)
  })

  it('lança erro quando o evento não tem nenhuma rotina associada', async () => {
    mockPrisma.event.findFirst.mockResolvedValue({ id: 'event_1', organizationId: 'org_1', recurrenceId: null })

    await expect(eventRecurrenceService.deactivate('org_1', 'event_1', 'user_1')).rejects.toThrow()
  })
})

describe('EventRecurrenceService.generateForAllActive', () => {
  it('soma as ocorrências geradas de todas as rotinas ativas e segue mesmo se uma delas falhar', async () => {
    const now = new Date('2026-11-17T12:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)

    mockPrisma.eventRecurrence.findMany.mockResolvedValue([
      { id: 'rec_1', durationMinutes: 60 },
      { id: 'rec_2', durationMinutes: 60 },
    ])

    mockPrisma.event.findFirst
      .mockResolvedValueOnce({ id: 'ev_1', startDate: now }) // rec_1: gera 8 ocorrências
      .mockRejectedValueOnce(new Error('falha de banco')) // rec_2: falha isolada

    const total = await eventRecurrenceService.generateForAllActive()

    expect(total).toBe(8)
  })
})
