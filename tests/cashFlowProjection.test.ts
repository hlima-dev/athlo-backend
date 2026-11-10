import { describe, it, expect } from 'vitest'
import { buildCashFlowProjection } from '../src/controllers/DashboardController'

const now = new Date('2026-11-10T12:00:00Z')

describe('buildCashFlowProjection', () => {
  it('soma entradas e saídas por dia e acumula o saldo em ordem cronológica', () => {
    const result = buildCashFlowProjection(
      [
        { type: 'RECEIVABLE', amount: 1000, dueDate: new Date('2026-11-15T00:00:00Z') },
        { type: 'PAYABLE', amount: 300, dueDate: new Date('2026-11-15T00:00:00Z') },
        { type: 'RECEIVABLE', amount: 500, dueDate: new Date('2026-11-20T00:00:00Z') },
      ],
      now,
    )

    expect(result).toEqual([
      { date: '2026-11-15', in: 1000, out: 300, balance: 700 },
      { date: '2026-11-20', in: 500, out: 0, balance: 1200 },
    ])
  })

  it('fatura já vencida conta como impacto no dia de hoje, não no passado', () => {
    const result = buildCashFlowProjection(
      [{ type: 'PAYABLE', amount: 200, dueDate: new Date('2026-10-01T00:00:00Z') }],
      now,
    )

    expect(result).toEqual([{ date: '2026-11-10', in: 0, out: 200, balance: -200 }])
  })

  it('sem faturas retorna série vazia', () => {
    expect(buildCashFlowProjection([], now)).toEqual([])
  })
})
