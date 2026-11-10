/**
 * Avisa por e-mail as organizações com regime tributário cadastrado
 * quando falta pouco (3 dias) pra uma obrigação fiscal recorrente (ex:
 * DAS do dia 20). Os prazos (TaxDeadline) são mantidos pelo time ATHLO,
 * não editáveis pelo cliente — ver prisma/seed.ts.
 *
 * Pensado para rodar uma vez por dia via um Render Cron Job
 * (Render → New → Cron Job → Build: npm install && npm run build,
 * Command: npm run reminders:tax, Schedule: 0 12 * * *). Não há
 * scheduler embutido na API porque o serviço web do Render não garante
 * um processo de longa duração para setInterval.
 */
import { prisma } from '../src/config/prisma'
import { EmailService } from '../src/services/EmailService'

const emailService = new EmailService()
const DAYS_BEFORE = 3

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

async function main() {
  const now = new Date()
  const warnByDay = now.getDate() + DAYS_BEFORE

  const deadlines = await prisma.taxDeadline.findMany({
    where: { dayOfMonth: { lte: warnByDay, gte: now.getDate() } },
  })

  if (deadlines.length === 0) {
    console.log('🔔 Nenhuma obrigação fiscal dentro da janela de aviso hoje')
    return
  }

  const currentMonth = monthKey(now)

  for (const deadline of deadlines) {
    const organizations = await prisma.organization.findMany({
      where: { taxRegime: deadline.regime },
      include: {
        users: { where: { orgRole: 'OWNER' }, take: 1 },
      },
    })

    console.log(`🔔 ${organizations.length} organização(ões) no regime ${deadline.regime} para "${deadline.label}"`)

    for (const organization of organizations) {
      const owner = organization.users[0]
      if (!owner) continue

      const alreadyReminded = await prisma.taxReminderLog.findUnique({
        where: {
          organizationId_taxDeadlineId_remindedForMonth: {
            organizationId: organization.id,
            taxDeadlineId: deadline.id,
            remindedForMonth: currentMonth,
          },
        },
      })
      if (alreadyReminded) continue

      const dueDate = new Date(now.getFullYear(), now.getMonth(), deadline.dayOfMonth)
      const dueDateFormatted = dueDate.toLocaleDateString('pt-BR')

      try {
        await emailService.sendTaxObligationReminder(
          owner.email,
          organization.name,
          deadline.label,
          dueDateFormatted,
        )
        await prisma.taxReminderLog.create({
          data: {
            organizationId: organization.id,
            taxDeadlineId: deadline.id,
            remindedForMonth: currentMonth,
          },
        })
        console.log(`✅ Lembrete enviado: "${deadline.label}" -> ${organization.name}`)
      } catch (err) {
        console.error(`❌ Falha ao avisar "${organization.name}" sobre "${deadline.label}":`, err)
      }
    }
  }
}

main()
  .catch((err) => {
    console.error('Erro ao executar lembretes de obrigação fiscal:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
