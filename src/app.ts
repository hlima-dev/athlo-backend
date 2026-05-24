import 'express-async-errors'
import express from 'express'
import cors from 'cors'

import { env } from './config/env'
import { router } from './routes'
import { errorHandler } from './middlewares/errorHandler'
import { requestLogger } from './middlewares/requestLogger'

export const app = express()

// ─────────────────────────────────────────────
// ORIGENS LIBERADAS
// ─────────────────────────────────────────────
const allowedOrigins = [
  'https://athlo-web-admin.vercel.app',
  'https://athlo-web-admin-i45czyrcw-hlima-dev1.vercel.app',
  'http://localhost:5173',
]

// ─────────────────────────────────────────────
// CONFIG CORS
// ─────────────────────────────────────────────
const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    // Permite requests sem origin (Postman etc)
    if (!origin) {
      return callback(null, true)
    }

    // Permite origins liberadas
    if (allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    // Bloqueia outras
    return callback(new Error('Not allowed by CORS'))
  },

  credentials: true,

  methods: [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
  ],

  allowedHeaders: [
    'Content-Type',
    'Authorization',
  ],
}

// ─────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────
app.use(cors(corsOptions))
app.options('*', cors(corsOptions))

// ─────────────────────────────────────────────
// MIDDLEWARES GLOBAIS
// ─────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({
  extended: true,
  limit: '10mb',
}))

app.use(requestLogger)

// ─────────────────────────────────────────────
// ROTA RAIZ
// ─────────────────────────────────────────────
app.get('/', (_req, res) => {
  return res.status(200).json({
    status: 'ok',
    message: 'ATHLO API online 🚀',
  })
})

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────
app.get('/health', (_req, res) => {
  return res.status(200).json({
    status: 'ok',
    app: 'ATHLO API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
  })
})

// ─────────────────────────────────────────────
// ROTAS DA API
// ─────────────────────────────────────────────
app.use('/api/v1', router)

// ─────────────────────────────────────────────
// 404
// ─────────────────────────────────────────────
app.use((_req, res) => {
  return res.status(404).json({
    status: 'error',
    message: 'Rota não encontrada',
  })
})

// ─────────────────────────────────────────────
// ERROR HANDLER
// ─────────────────────────────────────────────
app.use(errorHandler)