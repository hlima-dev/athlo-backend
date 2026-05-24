import 'express-async-errors'
import express from 'express'
import cors from 'cors'

import { env } from './config/env'
import { router } from './routes'
import { errorHandler } from './middlewares/errorHandler'
import { requestLogger } from './middlewares/requestLogger'

export const app = express()

const allowedOrigins = [
  'https://athlo-web-admin.vercel.app',
  'http://localhost:5173',
]

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    return callback(null, false)
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}

// CORS precisa vir ANTES das rotas
app.use(cors(corsOptions))
app.options('*', cors(corsOptions))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))
app.use(requestLogger)

app.get('/', (_req, res) => {
  return res.status(200).json({
    status: 'ok',
    message: 'ATHLO API online',
  })
})

app.get('/health', (_req, res) => {
  return res.status(200).json({
    status: 'ok',
    app: 'ATHLO API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
  })
})

app.use('/api/v1', router)

app.use((_req, res) => {
  return res.status(404).json({
    status: 'error',
    message: 'Rota não encontrada',
  })
})

app.use(errorHandler)