import 'express-async-errors'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'

import { env } from './config/env'
import { prisma } from './config/prisma'
import { router } from './routes'
import { errorHandler } from './middlewares/errorHandler'
import { requestLogger } from './middlewares/requestLogger'
import { generalLimiter } from './middlewares/rateLimiter'
import { verifyCsrf } from './middlewares/verifyCsrf'
import { StripeWebhookController } from './controllers/StripeWebhookController'

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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  })
)

app.use(cookieParser())

// Webhook do Stripe precisa do corpo bruto (Buffer) para validar a
// assinatura — por isso é montado antes do express.json() global, que
// converteria o corpo em objeto e quebraria a verificação.
const stripeWebhookController = new StripeWebhookController()
app.post(
  '/api/v1/stripe/webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => stripeWebhookController.handle(req, res),
)

app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true, limit: '2mb' }))
app.use(requestLogger)
app.use(verifyCsrf)

app.get('/', (_req, res) => {
  return res.status(200).json({ status: 'ok', message: 'ATHLO API online' })
})

app.get('/health', (_req, res) => {
  return res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Health check "profundo": faz uma query real no banco. Usado pelo workflow
// de keep-alive (.github/workflows/keep-alive.yml) pra gerar atividade de
// verdade no Supabase e evitar que o projeto free-tier hiberne por
// inatividade — um GET em `/health` sozinho não toca o banco, só mantém o
// serviço web (Render) acordado.
app.get('/health/db', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    return res.status(200).json({ status: 'ok', db: 'up', timestamp: new Date().toISOString() })
  } catch (error) {
    return res.status(503).json({ status: 'error', db: 'down', message: (error as Error).message })
  }
})

// Limite geral de requisições por IP — as rotas de autenticação já têm
// limites mais rígidos próprios (authLimiter, passwordResetLimiter); este
// cobre o restante da API (contatos, financeiro, pedidos etc.), que antes
// não tinha nenhum limite de taxa.
app.use('/api/v1', generalLimiter, router)

app.use((_req, res) => {
  return res.status(404).json({ status: 'error', message: 'Rota não encontrada' })
})

app.use(errorHandler)
