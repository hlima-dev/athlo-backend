import { ValidationError } from '../utils/AppError'

export interface ParsedEventDraft {
  title: string
  description: string
  type: 'MEETING' | 'TASK' | 'DEADLINE' | 'OTHER'
  location: string
  startDate: string
  endDate: string
  isOnline: boolean
}

const WEEKDAYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado']

const MONTHS: Record<string, number> = {
  janeiro: 0,
  fevereiro: 1,
  marco: 2,
  abril: 3,
  maio: 4,
  junho: 5,
  julho: 6,
  agosto: 7,
  setembro: 8,
  outubro: 9,
  novembro: 10,
  dezembro: 11,
}

// São Paulo (Brasília) não observa horário de verão desde 2019: offset fixo -03:00.
const SAO_PAULO_OFFSET = '-03:00'

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Lê os componentes de data/hora de um instante real, no fuso America/Sao_Paulo,
// e devolve um Date "surrogate" (âncora UTC) usado só para fazer aritmética de
// calendário — sempre manipulado via os getters/setters *UTC*, nunca os locais,
// para não depender do fuso horário configurado no servidor.
function toSaoPauloSurrogate(date: Date): Date {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0'
  const hour = parseInt(get('hour'), 10) % 24 // alguns engines retornam "24" à meia-noite

  return new Date(
    Date.UTC(parseInt(get('year'), 10), parseInt(get('month'), 10) - 1, parseInt(get('day'), 10), hour, parseInt(get('minute'), 10)),
  )
}

function startOfDay(surrogate: Date): Date {
  const d = new Date(surrogate)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function formatSaoPauloIso(surrogate: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = surrogate.getUTCFullYear()
  const mo = pad(surrogate.getUTCMonth() + 1)
  const d = pad(surrogate.getUTCDate())
  const h = pad(surrogate.getUTCHours())
  const mi = pad(surrogate.getUTCMinutes())
  return `${y}-${mo}-${d}T${h}:${mi}:00${SAO_PAULO_OFFSET}`
}

function detectType(normalized: string): ParsedEventDraft['type'] {
  if (/\b(prazo|vencimento|vence|data limite|deadline|entregar ate|expira)\b/.test(normalized)) {
    return 'DEADLINE'
  }
  if (/\b(tarefa|preparar|revisar|concluir|finalizar|organizar|providenciar)\b/.test(normalized)) {
    return 'TASK'
  }
  if (
    /\b(reuniao|encontro|recepcao|receber|visita|call|ligacao|conversa|apresentacao|atendimento)\b/.test(
      normalized,
    )
  ) {
    return 'MEETING'
  }
  return 'OTHER'
}

function detectIsOnline(normalized: string): boolean {
  return /\b(online|remoto|remota|virtual|zoom|meet|teams|videochamada|video chamada|chamada de video)\b/.test(
    normalized,
  )
}

function detectTime(normalized: string): { hours: number; minutes: number } | null {
  const explicit = normalized.match(/\b(?:as|a partir das?|por volta das?)\s*(\d{1,2})(?:[h:](\d{2}))?\s*h?\b/)
  if (explicit) {
    const hours = Math.min(23, parseInt(explicit[1], 10))
    const minutes = explicit[2] ? Math.min(59, parseInt(explicit[2], 10)) : 0
    return { hours, minutes }
  }

  const suffixed = normalized.match(/\b(\d{1,2})h(\d{2})?\b/)
  if (suffixed) {
    const hours = Math.min(23, parseInt(suffixed[1], 10))
    const minutes = suffixed[2] ? Math.min(59, parseInt(suffixed[2], 10)) : 0
    return { hours, minutes }
  }

  if (/\bmeio[- ]?dia\b/.test(normalized)) return { hours: 12, minutes: 0 }
  if (/\b(manha|de manha|pela manha)\b/.test(normalized)) return { hours: 9, minutes: 0 }
  if (/\b(tarde|de tarde|a tarde)\b/.test(normalized)) return { hours: 14, minutes: 0 }
  if (/\b(noite|de noite|a noite)\b/.test(normalized)) return { hours: 19, minutes: 0 }

  return null
}

function detectDate(normalized: string, todaySurrogate: Date): Date {
  const base = startOfDay(todaySurrogate)

  if (/\bhoje\b/.test(normalized)) return base

  if (/\bdepois de amanha\b/.test(normalized)) {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() + 2)
    return d
  }

  if (/\bamanha\b/.test(normalized)) {
    const d = new Date(base)
    d.setUTCDate(d.getUTCDate() + 1)
    return d
  }

  // dd/mm ou dd/mm/yyyy
  const numericDate = normalized.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (numericDate) {
    const day = parseInt(numericDate[1], 10)
    const month = parseInt(numericDate[2], 10) - 1
    let year = base.getUTCFullYear()
    if (numericDate[3]) {
      year = parseInt(numericDate[3], 10)
      if (year < 100) year += 2000
    }
    const d = new Date(Date.UTC(year, month, day))
    if (!numericDate[3] && d < base) d.setUTCFullYear(d.getUTCFullYear() + 1)
    return d
  }

  // "dia 20 de agosto" ou "dia 20"
  const dayOfMonth = normalized.match(/\bdia\s+(\d{1,2})(?:\s+de\s+([a-z]+))?\b/)
  if (dayOfMonth) {
    const day = parseInt(dayOfMonth[1], 10)
    const monthName = dayOfMonth[2] ? stripAccents(dayOfMonth[2]) : null
    const month = monthName && MONTHS[monthName] !== undefined ? MONTHS[monthName] : base.getUTCMonth()
    const d = new Date(Date.UTC(base.getUTCFullYear(), month, day))
    if (d < base) d.setUTCFullYear(d.getUTCFullYear() + 1)
    return d
  }

  // dia da semana (com ou sem "que vem"/"próxima" — na fala cotidiana isso
  // normalmente só reforça a ideia de "a próxima ocorrência", sem pular
  // mais uma semana, então tratamos igual)
  for (let i = 0; i < WEEKDAYS.length; i++) {
    const weekday = WEEKDAYS[i]
    const pattern = new RegExp(`\\b${weekday}(?:-feira)?\\b`)
    if (pattern.test(normalized)) {
      const d = new Date(base)
      let diff = (i - d.getUTCDay() + 7) % 7
      if (diff === 0) diff = 7 // próxima ocorrência, não hoje
      d.setUTCDate(d.getUTCDate() + diff)
      return d
    }
  }

  // sem data reconhecida: assume hoje
  return base
}

export class EventTextParserService {
  parse(prompt: string, referenceDate: Date = new Date()): ParsedEventDraft {
    const trimmed = prompt.trim()
    if (!trimmed) {
      throw new ValidationError('Descreva o compromisso em ao menos algumas palavras.')
    }

    const normalized = stripAccents(trimmed.toLowerCase())
    const todaySurrogate = toSaoPauloSurrogate(referenceDate)

    const type = detectType(normalized)
    const isOnline = detectIsOnline(normalized)
    const date = detectDate(normalized, todaySurrogate)
    const time = detectTime(normalized) || { hours: 9, minutes: 0 }

    const startSurrogate = new Date(date)
    startSurrogate.setUTCHours(time.hours, time.minutes, 0, 0)

    const endSurrogate = new Date(startSurrogate)
    endSurrogate.setUTCHours(endSurrogate.getUTCHours() + 1)

    let location = ''
    const locationMatch = trimmed.match(
      /\b(?:no|na|em)\s+([a-zà-úA-ZÀ-Ú0-9°º'"\s-]+?)(?=(?:\s+(?:hoje|amanh[ãa]|depois de amanh[ãa]|dia\s+\d|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|[àa]s?\s*\d|\d{1,2}h)\b)|[,.]|$)/i,
    )
    if (locationMatch) {
      location = locationMatch[1].trim()
    }

    const title = trimmed.length > 140 ? `${trimmed.slice(0, 137)}...` : trimmed
    const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1)

    return {
      title: capitalizedTitle,
      description: '',
      type,
      location,
      startDate: formatSaoPauloIso(startSurrogate),
      endDate: formatSaoPauloIso(endSurrogate),
      isOnline,
    }
  }
}
