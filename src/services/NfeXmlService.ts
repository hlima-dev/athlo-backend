import { XMLParser } from 'fast-xml-parser'
import { ValidationError } from '../utils/AppError'

export interface ParsedNfe {
  accessKey: string
  model: string
  issuerName: string
  issuerDocument: string
  recipientDocument?: string
  totalValue: number
  issueDate: string
  itemsSummary: string
}

interface NfeEmit {
  xNome?: string
  CNPJ?: string
  CPF?: string
}

interface NfeDest {
  CNPJ?: string
  CPF?: string
}

interface NfeTotal {
  ICMSTot?: { vNF?: string | number }
}

interface NfeIde {
  mod?: string | number
  dhEmi?: string
  dEmi?: string
}

interface NfeDetItem {
  prod?: { xProd?: string }
}

interface InfNFe {
  '@_Id'?: string
  emit?: NfeEmit
  dest?: NfeDest
  total?: NfeTotal
  ide?: NfeIde
  det?: NfeDetItem | NfeDetItem[]
}

interface NfeXmlRoot {
  nfeProc?: { NFe?: { infNFe?: InfNFe } }
  NFe?: { infNFe?: InfNFe }
  infNFe?: InfNFe
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

// Lê o XML de uma NF-e ou NFC-e (mesmo schema infNFe, só muda ide.mod:
// 55 = NF-e, 65 = NFC-e) e extrai os campos que importam pra virar uma
// fatura — não envolve nenhuma consulta à SEFAZ, é só leitura de um
// arquivo que a empresa já recebeu do emissor.
export class NfeXmlService {
  parse(xml: string): ParsedNfe {
    let root: NfeXmlRoot
    try {
      root = parser.parse(xml) as NfeXmlRoot
    } catch {
      throw new ValidationError('Arquivo XML inválido ou corrompido.')
    }

    // O XML pode vir cru (<NFe>) ou dentro do envelope de autorização
    // (<nfeProc><NFe>...) que normalmente se baixa do portal do emissor.
    const infNFe = root?.nfeProc?.NFe?.infNFe ?? root?.NFe?.infNFe ?? root?.infNFe

    if (!infNFe) {
      throw new ValidationError('O XML enviado não parece ser uma NF-e/NFC-e (tag infNFe não encontrada).')
    }

    const rawId = infNFe['@_Id'] || ''
    const accessKey = rawId.replace(/^NFe/, '').trim()
    if (!/^\d{44}$/.test(accessKey)) {
      throw new ValidationError('Não foi possível identificar a chave de acesso (44 dígitos) no XML.')
    }

    const emit = infNFe.emit || {}
    const dest = infNFe.dest || {}
    const total = infNFe.total?.ICMSTot || {}
    const ide = infNFe.ide || {}

    const items = asArray(infNFe.det)
    const itemsSummary = items
      .map((item) => item?.prod?.xProd)
      .filter((name): name is string => Boolean(name))
      .slice(0, 5)
      .join(', ')

    return {
      accessKey,
      model: String(ide.mod ?? ''),
      issuerName: emit.xNome || 'Fornecedor não identificado',
      issuerDocument: String(emit.CNPJ ?? emit.CPF ?? ''),
      recipientDocument: dest.CNPJ ? String(dest.CNPJ) : dest.CPF ? String(dest.CPF) : undefined,
      totalValue: Number(total.vNF ?? 0),
      issueDate: String(ide.dhEmi ?? ide.dEmi ?? new Date().toISOString()),
      itemsSummary,
    }
  }
}
