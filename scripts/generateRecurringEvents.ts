/**
 * Gera as próximas ocorrências de toda rotina semanal ativa (ver
 * EventRecurrenceService), mantendo um buffer de 8 semanas pra frente.
 *
 * Pensado para rodar 1x por dia via um Render Cron Job (Render → New →
 * Cron Job → Build: npm install && npm run build, Command:
 * npm run recurrence:generate, Schedule: 0 6 * * *). Não há scheduler
 * embutido na API porque o serviço web do Render não garante um processo
 * de longa duração para setInterval.
 */
import { prisma } from '../src/config/prisma'
import { EventRecurrenceService } from '../src/services/EventRecurrenceService'

const eventRecurrenceService = new EventRecurrenceService()

async function main() {
  const created = await eventRecurrenceService.generateForAllActive()
  console.log(`🔁 ${created} nova(s) ocorrência(s) gerada(s) a partir das rotinas ativas`)
}

main()
  .catch((err) => {
    console.error('Erro ao gerar ocorrências de rotinas:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
