import { describe, it, expect } from 'vitest'
import { formatCurrency, formatDate } from '../src/services/PdfService'

describe('services/PdfService — formatCurrency', () => {
  it('formata number', () => {
    expect(formatCurrency(1234.5)).toBe('R$ 1.234,50')
  })

  it('formata string numérica', () => {
    expect(formatCurrency('99.9')).toBe('R$ 99,90')
  })

  it('formata um objeto tipo Decimal do Prisma (toString numérico)', () => {
    const fakeDecimal = { toString: () => '500' }
    expect(formatCurrency(fakeDecimal)).toBe('R$ 500,00')
  })

  it('zero formata como R$ 0,00', () => {
    expect(formatCurrency(0)).toBe('R$ 0,00')
  })
})

describe('services/PdfService — formatDate', () => {
  it('formata uma Date para pt-BR', () => {
    const date = new Date(Date.UTC(2026, 0, 15, 12, 0, 0))
    expect(formatDate(date)).toBe(date.toLocaleDateString('pt-BR'))
  })

  it('aceita string ISO', () => {
    expect(formatDate('2026-03-10T00:00:00.000Z')).toMatch(/\d{2}\/\d{2}\/\d{4}/)
  })

  it('devolve "-" para null/undefined', () => {
    expect(formatDate(null)).toBe('-')
    expect(formatDate(undefined)).toBe('-')
  })

  it('devolve "-" para uma data inválida', () => {
    expect(formatDate('não é uma data')).toBe('-')
  })
})
