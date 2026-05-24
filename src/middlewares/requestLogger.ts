import { NextFunction, Request, Response } from 'express'
import { env } from '../config/env'

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  if (env.NODE_ENV === 'production') {
    return next()
  }

  const start = Date.now()
  const { method, url } = req

  res.on('finish', () => {
    const duration = Date.now() - start
    const status = res.statusCode

    const color =
      status >= 500
        ? '\x1b[31m'  // vermelho
        : status >= 400
        ? '\x1b[33m'  // amarelo
        : status >= 300
        ? '\x1b[36m'  // ciano
        : '\x1b[32m'  // verde

    const reset = '\x1b[0m'

    console.log(
      `${color}${method}${reset} ${url} ${color}${status}${reset} — ${duration}ms`,
    )
  })

  next()
}
