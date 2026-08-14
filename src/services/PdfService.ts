import PDFDocument from 'pdfkit'
import { Response } from 'express'

export class PdfService {
  streamDocument(
    res: Response,
    filename: string,
    build: (doc: PDFKit.PDFDocument) => void,
  ): void {
    const doc = new PDFDocument({ margin: 50, size: 'A4' })

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`)

    doc.pipe(res)
    build(doc)
    doc.end()
  }

  header(doc: PDFKit.PDFDocument, organizationName: string, title: string): void {
    doc
      .fontSize(20)
      .fillColor('#0891b2')
      .text(organizationName, { continued: false })
    doc.moveDown(0.3)
    doc.fontSize(14).fillColor('#0f172a').text(title)
    doc.moveDown(0.5)
    doc
      .strokeColor('#e2e8f0')
      .lineWidth(1)
      .moveTo(doc.x, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke()
    doc.moveDown(1)
    doc.fillColor('#0f172a')
  }

  field(doc: PDFKit.PDFDocument, label: string, value: string): void {
    doc
      .fontSize(10)
      .fillColor('#64748b')
      .text(label, { continued: true })
      .fillColor('#0f172a')
      .text(`  ${value}`)
    doc.moveDown(0.4)
  }
}

export function formatCurrency(value: number | string | { toString(): string }): string {
  return Number(value.toString()).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatDate(value?: Date | string | null): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('pt-BR')
}
