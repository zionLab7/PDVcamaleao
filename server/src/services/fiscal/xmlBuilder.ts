import { NfceItem, NfcePayment } from './types';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatIsoDate(date: Date): string {
  // Formato ISO com fuso horário: AAAA-MM-DDTHH:MM:SS-03:00
  const tzOffset = -3; // Horário de Brasília
  const d = new Date(date.getTime() + tzOffset * 3600 * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');

  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const h = pad(d.getUTCHours());
  const min = pad(d.getUTCMinutes());
  const s = pad(d.getUTCSeconds());

  return `${y}-${m}-${day}T${h}:${min}:${s}-03:00`;
}

export function buildNfceXml({
  accessKey,
  cNF,
  cDV,
  series,
  number,
  date = new Date(),
  environment = 'homologacao',
  storeName,
  storeCnpj,
  storeIe,
  storeAddress = 'Rua do Comercio, 100',
  storeCity = 'Sao Paulo',
  storeUf = 'SP',
  customerCpf,
  items,
  payments,
  subtotal,
  discount = 0,
  total,
  change = 0,
}: {
  accessKey: string;
  cNF: string;
  cDV: number;
  series: number;
  number: number;
  date?: Date;
  environment?: 'homologacao' | 'producao';
  storeName: string;
  storeCnpj: string;
  storeIe: string;
  storeAddress?: string;
  storeCity?: string;
  storeUf?: string;
  customerCpf?: string;
  items: NfceItem[];
  payments: NfcePayment[];
  subtotal: number;
  discount?: number;
  total: number;
  change?: number;
}): string {
  const tpAmb = environment === 'producao' ? '1' : '2';
  const cleanCnpj = storeCnpj.replace(/\D/g, '');
  const cleanIe = storeIe.replace(/\D/g, '') || 'ISENTO';
  const dhEmi = formatIsoDate(date);

  const cleanCpf = customerCpf ? customerCpf.replace(/\D/g, '') : '';
  const destTag = cleanCpf && cleanCpf.length === 11
    ? `<dest><CPF>${cleanCpf}</CPF><indIEDest>9</indIEDest></dest>`
    : '';

  // Itens da NFC-e
  const itemsXml = items.map((item) => {
    const cleanBarcode = item.ncm && item.ncm.length === 8 ? item.ncm : '00000000';
    const ncm = item.ncm && item.ncm.replace(/\D/g, '').length === 8 ? item.ncm.replace(/\D/g, '') : '22021000';
    const cfop = item.cfop || '5102';
    const qCom = item.quantity.toFixed(4);
    const vUnCom = item.unitPrice.toFixed(4);
    const vProd = item.totalPrice.toFixed(2);
    const vDesc = item.discount > 0 ? `<vDesc>${item.discount.toFixed(2)}</vDesc>` : '';

    return `
    <det nItem="${item.number}">
      <prod>
        <cProd>${escapeXml(item.productId.slice(0, 10))}</cProd>
        <cEAN>SEM GTIN</cEAN>
        <xProd>${escapeXml(item.name.slice(0, 120))}</xProd>
        <NCM>${ncm}</NCM>
        <CFOP>${cfop}</CFOP>
        <uCom>${escapeXml(item.unit || 'UN')}</uCom>
        <qCom>${qCom}</qCom>
        <vUnCom>${vUnCom}</vUnCom>
        <vProd>${vProd}</vProd>
        ${vDesc}
        <cEANTrib>SEM GTIN</cEANTrib>
        <uTrib>${escapeXml(item.unit || 'UN')}</uTrib>
        <qTrib>${qCom}</qTrib>
        <vUnTrib>${vUnCom}</vUnTrib>
        <indTot>1</indTot>
      </prod>
      <imposto>
        <vTotTrib>${(item.totalPrice * 0.15).toFixed(2)}</vTotTrib>
        <ICMS>
          <ICMSSN102>
            <orig>${item.origin || '0'}</orig>
            <CSOSN>102</CSOSN>
          </ICMSSN102>
        </ICMS>
        <PIS>
          <PISNT>
            <CST>07</CST>
          </PISNT>
        </PIS>
        <COFINS>
          <COFINSNT>
            <CST>07</CST>
          </COFINSNT>
        </COFINS>
      </imposto>
    </det>`;
  }).join('');

  // Pagamentos
  const paymentsXml = payments.map((p) => `
      <detPag>
        <indPag>0</indPag>
        <tPag>${p.methodCode || '01'}</tPag>
        <vPag>${p.amount.toFixed(2)}</vPag>
      </detPag>`).join('');

  const vTrocoTag = change > 0 ? `<vTroco>${change.toFixed(2)}</vTroco>` : '';

  const xml = `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${accessKey}" versao="4.00"><ide><cUF>35</cUF><cNF>${cNF}</cNF><natOp>VENDA AO CONSUMIDOR</natOp><mod>65</mod><serie>${series}</serie><nNF>${number}</nNF><dhEmi>${dhEmi}</dhEmi><tpNF>1</tpNF><idDest>1</idDest><cMunFG>3550308</cMunFG><tpImp>4</tpImp><tpEmis>1</tpEmis><cDV>${cDV}</cDV><tpAmb>${tpAmb}</tpAmb><finNFe>1</finNFe><indFinal>1</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>PDVCamaleao_2.0</verProc></ide><emit><CNPJ>${cleanCnpj}</CNPJ><xNome>${escapeXml(storeName)}</xNome><xFant>${escapeXml(storeName)}</xFant><enderEmit><xLgr>${escapeXml(storeAddress)}</xLgr><nro>S/N</nro><xBairro>Centro</xBairro><cMun>3550308</cMun><xMun>Sao Paulo</xMun><UF>${storeUf}</UF><CEP>01001000</CEP><cPais>1058</cPais><xPais>Brasil</xPais></enderEmit><IE>${cleanIe}</IE><CRT>1</CRT></emit>${destTag}${itemsXml}<total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${subtotal.toFixed(2)}</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>${discount.toFixed(2)}</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>${total.toFixed(2)}</vNF><vTotTrib>${(total * 0.15).toFixed(2)}</vTotTrib></ICMSTot></total><transp><modFrete>9</modFrete></transp><pag>${paymentsXml}${vTrocoTag}</pag><infAdic><infCpl>Trib aprox R$ ${(total * 0.15).toFixed(2)} (15.00%) Fonte: IBPT. Documento emitido por ME ou EPP optante pelo Simples Nacional.</infCpl></infAdic></infNFe></NFe>`;

  return xml.replace(/\n\s*/g, '');
}
