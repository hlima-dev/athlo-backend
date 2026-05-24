import { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { Prisma } from '@prisma/client'
import { AppError } from '../utils/AppError'
import { env } from '../config/env'

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // ── AppError (erros operacionais conhecidos) ──────────────
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    })
    return
  }

  // ── Zod Validation Error ──────────────────────────────────
  if (err instanceof ZodError) {
    res.status(422).json({
      status: 'validation_error',
      message: 'Dados inválidos',
      errors: err.flatten().fieldErrors,
    })
    return
  }

  // ── Prisma Errors ─────────────────────────────────────────
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const fields = (err.meta?.target as string[])?.join(', ') ?? 'campo'
      res.status(409).json({
        status: 'error',
        message: `Já existe um registro com este ${fields}`,
      })
      return
    }

    if (err.code === 'P2025') {
      res.status(404).json({
        status: 'error',
        message: 'Registro não encontrado',
      })
      return
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({
      status: 'error',
      message: 'Erro de validação no banco de dados',
    })
    return
  }

  // ── JWT Errors ────────────────────────────────────────────
  if (err instanceof Error && err.name === 'JsonWebTokenError') {
    res.status(401).json({
      status: 'error',
      message: 'Token inválido',
    })
    return
  }

  if (err instanceof Error && err.name === 'TokenExpiredError') {
    res.status(401).json({
      status: 'error',
      message: 'Token expirado',
    })
    return
  }

  // ── Erro genérico (não expor detalhes em produção) ────────
  console.error('🔥 Unhandled error:', err)

  res.status(500).json({
    status: 'error',
    message: 'Erro interno do servidor',
    ...(env.NODE_ENV === 'development' && {
      stack: err instanceof Error ? err.stack : String(err),
    }),
  })
}
