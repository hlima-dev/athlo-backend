import Anthropic from '@anthropic-ai/sdk'
import { env } from '../config/env'
import { ValidationError } from '../utils/AppError'

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new ValidationError(
      'Assistente de IA não configurado. Peça ao administrador para definir ANTHROPIC_API_KEY.'
    )
  }
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  }
  return client
}

export interface ParsedEventDraft {
  title: string
  description: string
  type: 'MEETING' | 'TASK' | 'DEADLINE' | 'OTHER'
  location: string
  startDate: string
  endDate: string
  isOnline: boolean
}

const eventSchema = {
  type: 'object' as const,
  properties: {
    title: { type: 'string', description: 'Título curto e claro do compromisso' },
    description: { type: 'string', description: 'Detalhes adicionais, ou string vazia' },
    type: {
      type: 'string',
      enum: ['MEETING', 'TASK', 'DEADLINE', 'OTHER'],
      description:
        'MEETING para reuniões/recepção de cliente, TASK para tarefas internas, DEADLINE para prazos, OTHER para entregas e demais compromissos',
    },
    location: { type: 'string', description: 'Local do compromisso, ou string vazia se não informado' },
    startDate: {
      type: 'string',
      description: 'Data e hora de início no formato ISO 8601 (ex: 2026-08-14T15:00:00-03:00)',
    },
    endDate: {
      type: 'string',
      description:
        'Data e hora de término no formato ISO 8601. Se não informado, use 1 hora após o início.',
    },
    isOnline: { type: 'boolean', description: 'true se for um compromisso online/remoto' },
  },
  required: ['title', 'description', 'type', 'location', 'startDate', 'endDate', 'isOnline'],
  additionalProperties: false,
}

export class AiService {
  async parseEventFromPrompt(prompt: string): Promise<ParsedEventDraft> {
    const anthropic = getClient()

    const now = new Date()
    const referenceDate = now.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'full',
      timeStyle: 'short',
    })

    const response = await anthropic.messages.create({
      model: 'claude-opus-5',
      max_tokens: 1024,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: eventSchema },
      },
      system: `Você ajuda a preencher a agenda de uma empresa a partir de uma frase em português.
Data e hora de referência (fuso America/Sao_Paulo): ${referenceDate}.
Interprete datas relativas ("amanhã", "sexta-feira que vem", "dia 20") em relação a essa referência.
Sempre responda com horários no fuso America/Sao_Paulo (offset -03:00).
Identifique reuniões, tarefas, prazos, entregas e recepção de clientes.`,
      messages: [
        {
          role: 'user',
          content: `Extraia um compromisso de agenda a partir desta frase: "${prompt}"`,
        },
      ],
    })

    const block = response.content.find((b) => b.type === 'text')
    if (!block || block.type !== 'text') {
      throw new ValidationError('Não foi possível interpretar o texto informado.')
    }

    try {
      return JSON.parse(block.text) as ParsedEventDraft
    } catch {
      throw new ValidationError('Não foi possível interpretar o texto informado.')
    }
  }
}
