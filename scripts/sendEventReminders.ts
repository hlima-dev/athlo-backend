/**
 * Verifica compromissos da agenda que estão prestes a começar e avisa o
 * responsável — notificação dentro do sistema (sino) + push no navegador
 * (notebook/celular, se o usuário tiver ativado).
 *
 * Pensado para rodar a cada 15 minutos via um Render Cron Job
 * (Render → New → Cron Job → Build: npm install && npm run build,
 * Command: npm run reminders:events, Schedule: * /15 * * * * — sem
 * espaço entre * e /15, removido aqui só para não fechar o comentário).
 * Não há scheduler embutido na API porque o serviço web do Render não
 * garante um processo de longa duração para setInterval.
 */
import { prisma } from '../src/config/prisma'
import { NotificationService } from '../src/services/NotificationService'

const notificationService = new NotificationService()

// Janela de "está prestes a começar" — precisa ser maior ou igual ao
// intervalo do cron, senão um compromisso pode passar batido entre duas
// execuções.
const WINDOW_MINUTES = 15

async function main() {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + WINDOW_MINUTES * 60 * 1000)

  const events = await prisma.event.findMany({
    where: {
      status: 'SCHEDULED',
      reminderSentAt: null,
      startDate: { gte: now, lte: windowEnd },
    },
    include: { assignedTo: true, createdBy: true, contact: true },
  })

  console.log(`🔔 ${events.length} compromisso(s) começando nos próximos ${WINDOW_MINUTES} minutos`)

  for (const event of events) {
    const recipient = event.assignedTo ?? event.createdBy
    if (!recipient) continue

    const time = new Date(event.startDate).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })

    const contactSuffix = event.contact ? ` com ${event.contact.name}` : ''

    try {
      await notificationService.notify({
        userId: recipient.id,
        type: 'EVENT_REMINDER',
        title: 'Compromisso em breve',
        body: `${event.title}${contactSuffix} às ${time}`,
        url: '/eventos',
        data: { eventId: event.id },
      })

      await prisma.event.update({
        where: { id: event.id },
        data: { reminderSentAt: new Date() },
      })

      console.log(`✅ Lembrete enviado: "${event.title}" -> ${recipient.email}`)
    } catch (err) {
      console.error(`❌ Falha ao notificar o compromisso "${event.title}":`, err)
    }
  }
}

main()
  .catch((err) => {
    console.error('Erro ao executar lembretes de agenda:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
