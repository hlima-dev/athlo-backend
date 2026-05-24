import { app } from './app'
import { env } from './config/env'
import { prisma } from './config/prisma'

const BANNER = `
╔══════════════════════════════════════════╗
║                                          ║
║   🏃  A T H L O   A P I   v1.0.0        ║
║   ONG ASDA Sorocaba                      ║
║                                          ║
╚══════════════════════════════════════════╝
`

async function bootstrap() {
  console.log(BANNER)

  // Testa conexão com o banco antes de subir
  try {
    await prisma.$connect()
    console.log('✅  Banco de dados conectado')
  } catch (error) {
    console.error('❌  Falha ao conectar ao banco de dados:', error)
    process.exit(1)
  }

  const server = app.listen(env.PORT, () => {
    console.log(`🚀  Servidor rodando em http://localhost:${env.PORT}`)
    console.log(`📚  API disponível em http://localhost:${env.PORT}/api/v1`)
    console.log(`🌡️   Health check em http://localhost:${env.PORT}/health`)
    console.log(`🔧  Ambiente: ${env.NODE_ENV}\n`)
  })

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n⚠️   Recebido ${signal}. Encerrando graciosamente...`)
    server.close(async () => {
      await prisma.$disconnect()
      console.log('🛑  Servidor encerrado.')
      process.exit(0)
    })
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  process.on('unhandledRejection', (reason) => {
    console.error('🔥  Unhandled Rejection:', reason)
  })

  process.on('uncaughtException', (error) => {
    console.error('🔥  Uncaught Exception:', error)
    process.exit(1)
  })
}

bootstrap()
