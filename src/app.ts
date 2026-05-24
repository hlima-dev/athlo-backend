import 'express-async-errors'
import express from 'express'
import cors from 'cors'
import { env } from './config/env'
import { router } from './routes'
import { errorHandler } from './middlewares/errorHandler'
import { requestLogger } from './middlewares/requestLogger'

export const app = express()

// ── Middlewares globais ───────────────────────
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(requestLogger)
app.get('/', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'ATHLO API online',
  })
})

// ── Health check ──────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    app: 'ATHLO API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
  })
})

// ── Rotas da API ──────────────────────────────
app.use('/api/v1', router)

// ── 404 ───────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Rota não encontrada',
  })
})

// ── Error handler (deve ser o último) ─────────
app.use(errorHandler)
