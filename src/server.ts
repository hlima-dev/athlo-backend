import { app } from './app'
import { env } from './config/env'
import { prisma } from './config/prisma'

const BANNER = `
╔══════════════════════════════════════════╗
║                                          ║
║   🏢  A T H L O   A P I   v1.0.0        ║
║   SaaS para pequenas e médias empresas   ║
║                                          ║
╚══════════════════════════════════════════╝
`

// Tenta conectar ao banco algumas vezes antes de desistir. Isso existe
// porque o Supabase free-tier (pooler) pode demorar alguns segundos pra
// responder logo depois que o serviço do Render acorda de um spin-down —
// sem retry, a 1ª tentativa falhava, o processo encerrava com
// process.exit(1), o Render reiniciava um container novo do zero, e o
// ciclo se repetia (crash loop) até a sorte alinhar os dois acordando ao
// mesmo tempo. Isso podia levar bem mais que qualquer timeout razoável de
// cliente, e foi a causa real de "erro ao cadastrar/entrar" visto em
// produção mesmo com usuário e senha corretos.
async function connectWithRetry(maxAttempts = 5, delayMs = 3000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$connect()
      console.log('✅  Banco de dados conectado')
      return true
    } catch (error) {
      console.error(`❌  Falha ao conectar ao banco (tentativa ${attempt}/${maxAttempts}):`, error)
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }
  return false
}

async function bootstrap() {
  console.log(BANNER)

  // A porta abre JÁ, antes de esperar o banco — é o que o health check de
  // deploy do Render observa pra considerar o deploy "Live". Se a gente
  // esperar o banco responder antes de abrir a porta (como era antes) e o
  // banco demorar mais que a janela de health check do Render, o deploy
  // inteiro é marcado como falho e o Render volta pra versão anterior —
  // foi exatamente o que aconteceu com os últimos deploys em produção.
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    console.log(`🚀  Servidor rodando na porta ${env.PORT}`)
    console.log(`📚  API disponível em http://localhost:${env.PORT}/api/v1`)
    console.log(`🌡️   Health check em http://localhost:${env.PORT}/health`)
    console.log(`🔧  Ambiente: ${env.NODE_ENV}\n`)
  })

  // Conexão com o banco acontece em paralelo, sem bloquear a porta. Mesmo
  // se esgotar as tentativas, o processo continua de pé — o Prisma
  // reconecta sozinho na próxima query real, então não tem motivo pra
  // crashar o processo por causa de uma demora pontual do banco. As
  // rotas que dependerem do banco vão devolver erro normalmente até a
  // conexão se restabelecer.
  connectWithRetry().then((connected) => {
    if (!connected) {
      console.error('⚠️   Não confirmou conexão com o banco nas tentativas iniciais — tentará de novo nas próximas queries.')
    }
  })

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