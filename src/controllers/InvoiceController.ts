import { Request, Response } from 'express'
import { z } from 'zod'

import { InvoiceService } from '../services/InvoiceService'
import { PdfService, formatCurrency, formatDate } from '../services/PdfService'
import { NfeXmlService } from '../services/NfeXmlService'
import { getPagination, successResponse } from '../utils/pagination'
import { ConflictError, ValidationError } from '../utils/AppError'
import { prisma } from '../config/prisma'
import { InvoiceMethod, InvoiceStatus, InvoiceType } from '@prisma/client'

const invoiceService = new InvoiceService()
const pdfService = new PdfService()
const nfeXmlService = new NfeXmlService()

const typeLabels: Record<string, string> = {
  RECEIVABLE: 'A receber',
  PAYABLE: 'A pagar',
}

const statusLabels: Record<string, string> = {
  PENDING: 'Pendente',
  PAID: 'Paga',
  OVERDUE: 'Vencida',
  CANCELED: 'Cancelada',
}

const methodLabels: Record<string, string> = {
  PIX: 'PIX',
  CREDIT_CARD: 'Cartão de crédito',
  BANK_TRANSFER: 'Transferência',
  BOLETO: 'Boleto',
  CASH: 'Dinheiro',
  OTHER: 'Outro',
}

const createInvoiceSchema = z.object({
  type: z.nativeEnum(InvoiceType).optional(),
  description: z.string().min(2),
  amount: z.number().positive('Valor deve ser positivo'),
  dueDate: z.coerce.date(),
  status: z.nativeEnum(InvoiceStatus).optional(),
  method: z.nativeEnum(InvoiceMethod).optional(),
  notes: z.string().optional(),
  contactId: z.string().optional(),
  accessKey: z.string().length(44).optional(),
})

const updateInvoiceSchema = createInvoiceSchema.partial()

const markPaidSchema = z.object({
  method: z.nativeEnum(InvoiceMethod).optional(),
})

export class InvoiceController {
  async create(req: Request, res: Response): Promise<void> {
    const data = createInvoiceSchema.parse(req.body)
    const invoice = await invoiceService.create(req.user!.organizationId, req.user!.id, data)
    res.status(201).json(successResponse(invoice, 'Fatura criada com sucesso'))
  }

  // Lê o XML de uma NF-e/NFC-e que a empresa já recebeu (não consulta a
  // SEFAZ) e devolve um rascunho pro usuário revisar antes de salvar —
  // mesmo padrão do quick-parse por texto da Agenda.
  async importXml(req: Request, res: Response): Promise<void> {
    const xml = typeof req.body === 'string' ? req.body : ''
    if (!xml.trim()) {
      throw new ValidationError('Envie o conteúdo do arquivo XML da nota fiscal.')
    }

    const parsed = nfeXmlService.parse(xml)

    const existing = await prisma.invoice.findFirst({
      where: { organizationId: req.user!.organizationId, accessKey: parsed.accessKey },
    })
    if (existing) {
      throw new ConflictError('Essa nota fiscal já foi importada anteriormente.')
    }

    const organization = await prisma.organization.findUnique({
      where: { id: req.user!.organizationId },
      select: { document: true },
    })
    const onlyDigits = (value?: string | null) => (value || '').replace(/\D/g, '')
    const issuedByUs =
      onlyDigits(organization?.document) !== '' &&
      onlyDigits(organization?.document) === onlyDigits(parsed.issuerDocument)

    res.status(200).json(
      successResponse({
        ...parsed,
        suggestedType: issuedByUs ? InvoiceType.RECEIVABLE : InvoiceType.PAYABLE,
      }),
    )
  }

  async list(req: Request, res: Response): Promise<void> {
    const pagination = getPagination(req)

    const filter = {
      type: req.query.type as InvoiceType | undefined,
      status: req.query.status as InvoiceStatus | undefined,
      contactId: req.query.contactId as string | undefined,
      search: req.query.search as string | undefined,
    }

    const result = await invoiceService.findAll(req.user!.organizationId, filter, pagination)
    res.status(200).json(successResponse(result))
  }

  async getById(req: Request, res: Response): Promise<void> {
    const invoice = await invoiceService.findById(req.user!.organizationId, String(req.params.id))
    res.status(200).json(successResponse(invoice))
  }

  async update(req: Request, res: Response): Promise<void> {
    const data = updateInvoiceSchema.parse(req.body)
    const invoice = await invoiceService.update(req.user!.organizationId, String(req.params.id), data, req.user!.id)
    res.status(200).json(successResponse(invoice, 'Fatura atualizada com sucesso'))
  }

  async markPaid(req: Request, res: Response): Promise<void> {
    const { method } = markPaidSchema.parse(req.body)
    const invoice = await invoiceService.markPaid(req.user!.organizationId, String(req.params.id), method, req.user!.id)
    res.status(200).json(successResponse(invoice, 'Fatura marcada como paga'))
  }

  async delete(req: Request, res: Response): Promise<void> {
    await invoiceService.delete(req.user!.organizationId, String(req.params.id), req.user!.id)
    res.status(204).send()
  }

  async generatePdf(req: Request, res: Response): Promise<void> {
    const invoice = await invoiceService.findById(req.user!.organizationId, String(req.params.id))
    const organization = await prisma.organization.findUnique({
      where: { id: req.user!.organizationId },
    })

    pdfService.streamDocument(res, `fatura-${invoice.id}.pdf`, (doc) => {
      pdfService.header(doc, organization?.name || 'ATHLO', 'Fatura')

      pdfService.field(doc, 'Descrição:', invoice.description)
      pdfService.field(doc, 'Tipo:', typeLabels[invoice.type] || invoice.type)
      pdfService.field(doc, 'Valor:', formatCurrency(invoice.amount))
      pdfService.field(doc, 'Vencimento:', formatDate(invoice.dueDate))
      pdfService.field(doc, 'Status:', statusLabels[invoice.status] || invoice.status)

      if (invoice.contact) {
        pdfService.field(doc, 'Cliente/Fornecedor:', invoice.contact.name)
      }
      if (invoice.method) {
        pdfService.field(doc, 'Forma de pagamento:', methodLabels[invoice.method] || invoice.method)
      }
      if (invoice.paidAt) {
        pdfService.field(doc, 'Pago em:', formatDate(invoice.paidAt))
      }
      if (invoice.notes) {
        doc.moveDown(0.5)
        pdfService.field(doc, 'Observações:', invoice.notes)
      }

      doc.moveDown(1.5)
      doc
        .fontSize(8)
        .fillColor('#9C9A90')
        .text(`Gerado em ${formatDate(new Date())} — ATHLO`, { align: 'center' })
    })
  }
}
