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
      .fillColor('#12352A')
      .text(organizationName, { continued: false })
    doc.moveDown(0.3)
    doc.fontSize(14).fillColor('#16170F').text(title)
    doc.moveDown(0.5)
    doc
      .strokeColor('#E4E0D6')
      .lineWidth(1)
      .moveTo(doc.x, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke()
    doc.moveDown(1)
    doc.fillColor('#16170F')
  }

  field(doc: PDFKit.PDFDocument, label: string, value: string): void {
    doc
      .fontSize(10)
      .fillColor('#6E6C63')
      .text(label, { continued: true })
      .fillColor('#16170F')
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
