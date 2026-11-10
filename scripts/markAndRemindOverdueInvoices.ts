/**
 * Marca faturas PENDING vencidas como OVERDUE e manda um e-mail de
 * cobrança (só pra fatura a receber — RECEIVABLE — com contato com
 * e-mail cadastrado). Um script só pra fazer as duas coisas numa
 * passada, pra não depender da ordem entre dois Cron Jobs.
 *
 * Pensado para rodar uma vez por dia via um Render Cron Job
 * (Render → New → Cron Job → Build: npm install && npm run build,
 * Command: npm run reminders:overdue, Schedule: 0 12 * * * — 09:00 em
 * São Paulo, igual o lembrete de fatura a vencer). Não há scheduler
 * embutido na API porque o serviço web do Render não garante um
 * processo de longa duração para setInterval.
 */
import { prisma } from '../src/config/prisma'
import { EmailService } from '../src/services/EmailService'
import { formatCurrency, formatDate } from '../src/services/PdfService'

const emailService = new EmailService()

async function main() {
  const now = new Date()

  const overdueInvoices = await prisma.invoice.findMany({
    where: {
      status: 'PENDING',
      dueDate: { lt: now },
    },
    include: { contact: true },
  })

  console.log(`🔔 ${overdueInvoices.length} fatura(s) vencida(s) encontrada(s)`)

  for (const invoice of overdueInvoices) {
    try {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'OVERDUE' },
      })
      console.log(`✅ Marcada como vencida: ${invoice.description}`)
    } catch (err) {
      console.error(`❌ Falha ao marcar "${invoice.description}" como vencida:`, err)
      continue
    }

    if (invoice.type !== 'RECEIVABLE' || invoice.reminderSentAt) continue

    const email = invoice.contact?.email
    const name = invoice.contact?.name ?? 'Cliente'
    if (!email) continue

    try {
      await emailService.sendInvoiceOverdueReminder(
        email,
        name,
        invoice.description,
        formatCurrency(invoice.amount),
        formatDate(invoice.dueDate),
      )
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { reminderSentAt: new Date() },
      })
      console.log(`✅ Cobrança enviada: ${invoice.description} -> ${email}`)
    } catch (err) {
      console.error(`❌ Falha ao enviar cobrança de "${invoice.description}":`, err)
    }
  }
}

main()
  .catch((err) => {
    console.error('Erro ao executar rotina de faturas vencidas:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
