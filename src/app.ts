import 'express-async-errors'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'

import { env } from './config/env'
import { router } from './routes'
import { errorHandler } from './middlewares/errorHandler'
import { requestLogger } from './middlewares/requestLogger'

export const app = express()

app.use(helmet())

const allowedOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim())

// Previews do Vercel geram uma URL única por deploy (*.vercel.app) — liberamos
// qualquer subdomínio vercel.app automaticamente, além da lista explícita de
// CORS_ORIGINS (usada para produção e outros domínios fixos).
function isAllowedOrigin(origin: string): boolean {
  if (allowedOrigins.includes(origin)) return true
  try {
    const { hostname, protocol } = new URL(origin)
    return protocol === 'https:' && hostname.endsWith('.vercel.app')
  } catch {
    return false
  }
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin && env.NODE_ENV !== 'production') return callback(null, true)
      if (!origin || isAllowedOrigin(origin)) return callback(null, true)
      callback(new Error(`Origin ${origin} not allowed by CORS`))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)

app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true, limit: '2mb' }))
app.use(requestLogger)

app.get('/', (_req, res) => {
  return res.status(200).json({ status: 'ok', message: 'ATHLO API online' })
})

app.get('/health', (_req, res) => {
  return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/v1', router)

app.use((_req, res) => {
  return res.status(404).json({ status: 'error', message: 'Rota não encontrada' })
})

app.use(errorHandler)
