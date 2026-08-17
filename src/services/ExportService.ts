import ExcelJS from 'exceljs'
import { Response } from 'express'

const BRAND_COLOR = 'FF0891B2' // cyan-600, mesma cor usada no PDF
const HEADER_FILL = 'FFE0F2FE' // cyan-100

interface DashboardExportData {
  organizationName: string
  contacts: number
  revenue: number
  events: number
  pendingInvoices: number
  openOrders: number
  growthData: { month: string; contatos: number }[]
  revenueData: { month: string; valor: number }[]
  goals: { title: string; value: number }[]
}

export class ExportService {
  async streamDashboardReport(res: Response, data: DashboardExportData): Promise<void> {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'ATHLO'
    workbook.created = new Date()

    this.buildSummarySheet(workbook, data)
    this.buildSeriesSheet(workbook, 'Crescimento de contatos', ['Mês', 'Contatos'], data.growthData, [
      'month',
      'contatos',
    ])
    this.buildSeriesSheet(workbook, 'Receita por mês', ['Mês', 'Valor (R$)'], data.revenueData, [
      'month',
      'valor',
    ])
    this.buildGoalsSheet(workbook, data.goals)

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-athlo.xlsx"')

    await workbook.xlsx.write(res)
    res.end()
  }

  private styleHeaderRow(row: ExcelJS.Row): void {
    row.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FF0F172A' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
      cell.alignment = { vertical: 'middle' }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } }
    })
  }

  private buildSummarySheet(workbook: ExcelJS.Workbook, data: DashboardExportData): void {
    const sheet = workbook.addWorksheet('Resumo')
    sheet.columns = [{ width: 32 }, { width: 22 }]

    sheet.mergeCells('A1:B1')
    const title = sheet.getCell('A1')
    title.value = `Relatório ATHLO — ${data.organizationName}`
    title.font = { bold: true, size: 14, color: { argb: BRAND_COLOR } }

    sheet.getCell('A2').value = `Gerado em ${new Date().toLocaleDateString('pt-BR')}`
    sheet.getCell('A2').font = { italic: true, color: { argb: 'FF64748B' } }

    sheet.addRow([])
    const headerRow = sheet.addRow(['Indicador', 'Valor'])
    this.styleHeaderRow(headerRow)

    const rows: [string, string | number][] = [
      ['Contatos cadastrados', data.contacts],
      ['Receita do mês', `R$ ${data.revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
      ['Compromissos', data.events],
      ['Faturas pendentes', data.pendingInvoices],
      ['Pedidos em aberto', data.openOrders],
    ]

    for (const [label, value] of rows) {
      sheet.addRow([label, value])
    }
  }

  private buildSeriesSheet(
    workbook: ExcelJS.Workbook,
    sheetName: string,
    headers: string[],
    items: Record<string, unknown>[],
    keys: string[],
  ): void {
    const sheet = workbook.addWorksheet(sheetName)
    sheet.columns = headers.map((h) => ({ width: Math.max(h.length + 6, 18) }))

    const headerRow = sheet.addRow(headers)
    this.styleHeaderRow(headerRow)

    if (items.length === 0) {
      sheet.addRow(['Sem dados neste período'])
      return
    }

    for (const item of items) {
      sheet.addRow(keys.map((k) => item[k] as string | number))
    }
  }

  private buildGoalsSheet(workbook: ExcelJS.Workbook, goals: { title: string; value: number }[]): void {
    const sheet = workbook.addWorksheet('Metas estratégicas')
    sheet.columns = [{ width: 40 }, { width: 18 }]

    const headerRow = sheet.addRow(['Meta', 'Progresso'])
    this.styleHeaderRow(headerRow)

    for (const goal of goals) {
      const row = sheet.addRow([goal.title, goal.value / 100])
      row.getCell(2).numFmt = '0%'
    }
  }
}
