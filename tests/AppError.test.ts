import { describe, it, expect } from 'vitest'
import {
  AppError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  PaymentRequiredError,
} from '../src/utils/AppError'

describe('utils/AppError', () => {
  it('AppError guarda a mensagem e o status code', () => {
    const err = new AppError('deu ruim', 418)
    expect(err.message).toBe('deu ruim')
    expect(err.statusCode).toBe(418)
    expect(err.isOperational).toBe(true)
  })

  it.each([
    [UnauthorizedError, 401],
    [ForbiddenError, 403],
    [NotFoundError, 404],
    [ConflictError, 409],
    [ValidationError, 422],
    [PaymentRequiredError, 402],
  ] as const)('%s usa o status code %i', (ErrorClass, expectedStatus) => {
    const err = new ErrorClass()
    expect(err.statusCode).toBe(expectedStatus)
    expect(err).toBeInstanceOf(AppError)
    expect(err).toBeInstanceOf(Error)
  })

  it('NotFoundError monta a mensagem a partir do nome do recurso', () => {
    expect(new NotFoundError('Fatura').message).toBe('Fatura não encontrado')
    expect(new NotFoundError().message).toBe('Recurso não encontrado')
  })

  it('mensagens customizadas sobrescrevem o padrão', () => {
    expect(new UnauthorizedError('token expirado').message).toBe('token expirado')
  })
})
