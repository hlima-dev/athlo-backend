/**
 * Envia lembretes por e-mail de faturas a vencer nos próximos 2 dias.
 *
 * Pensado para rodar uma vez por dia via um Render Cron Job
 * (Render → New → Cron Job → Build: npm install && npm run build,
 * Command: npm run reminders:invoices, Schedule: 0 12 * * * — 09:00 em
 * São Paulo). Não há scheduler embutido na API porque o serviço web do
 * Render não garante um processo de longa duração para setInterval.
 */
import { prisma } from '../src/config/prisma'
import { EmailService } from '../src/services/EmailService'
import { formatCurrency, formatDate } from '../src/services/PdfService'

const emailService = new EmailService()

async function main() {
  const now = new Date()
  const in2Days = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 2)

  const invoices = await prisma.invoice.findMany({
    where: {
      status: 'PENDING',
      type: 'RECEIVABLE',
      dueDate: { gte: now, lte: in2Days },
    },
    include: { contact: true },
  })

  console.log(`🔔 ${invoices.length} fatura(s) a vencer nos próximos 2 dias`)

  for (const invoice of invoices) {
    const email = invoice.contact?.email
    const name = invoice.contact?.name ?? 'Cliente'

    if (!email) continue

    try {
      await emailService.sendInvoiceDueReminder(
        email,
        name,
        invoice.description,
        formatCurrency(invoice.amount),
        formatDate(invoice.dueDate),
      )
      console.log(`✅ Lembrete enviado: ${invoice.description} -> ${email}`)
    } catch (err) {
      console.error(`❌ Falha ao enviar lembrete de "${invoice.description}":`, err)
    }
  }
}

main()
  .catch((err) => {
    console.error('Erro ao executar lembretes de faturas:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
