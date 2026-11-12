import { describe, it, expect } from 'vitest'
import { NfeXmlService } from '../src/services/NfeXmlService'

const service = new NfeXmlService()

const accessKey = '35260101234567000199550010000001231234567890'

function buildNfe({ wrapped = false, det = '<det><prod><xProd>Produto teste</xProd></prod></det>' } = {}) {
  const nfe = `
    <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
      <infNFe Id="NFe${accessKey}" versao="4.00">
        <ide><mod>55</mod><dhEmi>2026-03-10T10:00:00-03:00</dhEmi></ide>
        <emit><CNPJ>11222333000181</CNPJ><xNome>Fornecedor Teste Ltda</xNome></emit>
        <dest><CNPJ>99888777000166</CNPJ></dest>
        ${det}
        <total><ICMSTot><vNF>500.00</vNF></ICMSTot></total>
      </infNFe>
    </NFe>
  `
  return wrapped ? `<nfeProc>${nfe}<protNFe /></nfeProc>` : nfe
}

describe('services/NfeXmlService', () => {
  it('extrai os campos de um XML de NF-e cru', () => {
    const parsed = service.parse(buildNfe())

    expect(parsed.accessKey).toBe(accessKey)
    expect(parsed.model).toBe('55')
    expect(parsed.issuerName).toBe('Fornecedor Teste Ltda')
    expect(parsed.issuerDocument).toBe('11222333000181')
    expect(parsed.recipientDocument).toBe('99888777000166')
    expect(parsed.totalValue).toBe(500)
    expect(parsed.itemsSummary).toBe('Produto teste')
  })

  it('extrai os campos quando o XML vem dentro do envelope nfeProc', () => {
    const parsed = service.parse(buildNfe({ wrapped: true }))
    expect(parsed.accessKey).toBe(accessKey)
    expect(parsed.issuerName).toBe('Fornecedor Teste Ltda')
  })

  it('junta os nomes de vários itens quando há mais de um det', () => {
    const det = `
      <det><prod><xProd>Item A</xProd></prod></det>
      <det><prod><xProd>Item B</xProd></prod></det>
    `
    const parsed = service.parse(buildNfe({ det }))
    expect(parsed.itemsSummary).toBe('Item A, Item B')
  })

  it('rejeita um XML que não é NF-e (sem infNFe)', () => {
    expect(() => service.parse('<root><foo>bar</foo></root>')).toThrow(/infNFe/)
  })

  it('rejeita um XML malformado', () => {
    expect(() => service.parse('<NFe><infNFe')).toThrow(/inválido/)
  })

  it('rejeita quando a chave de acesso não tem 44 dígitos', () => {
    const badXml = buildNfe().replace(accessKey, '123')
    expect(() => service.parse(badXml)).toThrow(/chave de acesso/)
  })
})
