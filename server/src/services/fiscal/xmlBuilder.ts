import { FiscalEnvironment, NfceItem, NfcePayment } from './types';
import { publicConsultationUrl } from './qrCode';

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export interface FiscalIssuer {
  name: string;
  cnpj: string;
  ie: string;
  street: string;
  number: string;
  district: string;
  cityCode: string;
  city: string;
  postalCode: string;
  taxSource: string;
}

export const contributionCodes = ['04', '05', '06', '07', '08', '09', '49', '99'] as const;

function contribution(tag: 'PIS' | 'COFINS', cst: string): string {
  if (['49', '99'].includes(cst)) {
    return `<${tag}><${tag}Outr><CST>${cst}</CST><vBC>0.00</vBC><p${tag}>0.00</p${tag}><v${tag}>0.00</v${tag}></${tag}Outr></${tag}>`;
  }
  return `<${tag}><${tag}NT><CST>${cst}</CST></${tag}NT></${tag}>`;
}

export function buildNfceXml({ accessKey, cNF, cDV, series, number, date, environment,
  issuer, customerCpf, items, payments, total, change, qrCodeUrl }: {
  accessKey: string;
  cNF: string;
  cDV: number;
  series: number;
  number: number;
  date: Date;
  environment: FiscalEnvironment;
  issuer: FiscalIssuer;
  customerCpf?: string;
  items: NfceItem[];
  payments: NfcePayment[];
  total: number;
  change: number;
  qrCodeUrl: string;
}): string {
  const tpAmb = environment === 'producao' ? '1' : '2';
  const dhEmi = new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 19) + '-03:00';
  const dest = customerCpf ? `<dest><CPF>${customerCpf}</CPF><indIEDest>9</indIEDest></dest>` : '';
  const money = (value: number) => value.toFixed(2);
  const taxTotal = items.reduce((sum, item) => sum + item.taxEstimate, 0);

  const details = items.map(item => {
    const quantity = item.quantity.toFixed(4);
    const price = item.unitPrice.toFixed(10);
    const unit = escapeXml(item.unit);
    const name = tpAmb === '2' && item.number === 1
      ? 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
      : escapeXml(item.name.slice(0, 120));
    const icmsTag = item.csosn === '500' ? 'ICMSSN500' : 'ICMSSN102';
    return `<det nItem="${item.number}"><prod><cProd>${escapeXml(item.productId.slice(0, 60))}</cProd><cEAN>SEM GTIN</cEAN><xProd>${name}</xProd><NCM>${item.ncm}</NCM>${item.cest ? `<CEST>${item.cest}</CEST>` : ''}<CFOP>${item.cfop}</CFOP><uCom>${unit}</uCom><qCom>${quantity}</qCom><vUnCom>${price}</vUnCom><vProd>${money(item.totalPrice)}</vProd><cEANTrib>SEM GTIN</cEANTrib><uTrib>${unit}</uTrib><qTrib>${quantity}</qTrib><vUnTrib>${price}</vUnTrib>${item.discount ? `<vDesc>${money(item.discount)}</vDesc>` : ''}<indTot>1</indTot></prod><imposto><vTotTrib>${money(item.taxEstimate)}</vTotTrib><ICMS><${icmsTag}><orig>${item.origin}</orig><CSOSN>${item.csosn}</CSOSN></${icmsTag}></ICMS>${contribution('PIS', item.pisCst)}${contribution('COFINS', item.cofinsCst)}</imposto></det>`;
  }).join('');
  const paymentXml = payments.map(payment => {
    const other = payment.methodCode === '99' ? '<xPag>Fiado</xPag>' : '';
    const card = ['03', '04'].includes(payment.methodCode) ? '<card><tpIntegra>2</tpIntegra></card>' : '';
    return `<detPag><indPag>${payment.methodCode === '99' ? '1' : '0'}</indPag><tPag>${payment.methodCode}</tPag>${other}<vPag>${money(payment.amount)}</vPag>${card}</detPag>`;
  }).join('');
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const discount = items.reduce((sum, item) => sum + item.discount, 0);

  return [
    `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${accessKey}" versao="4.00">`,
    `<ide><cUF>35</cUF><cNF>${cNF}</cNF><natOp>VENDA AO CONSUMIDOR</natOp><mod>65</mod><serie>${series}</serie><nNF>${number}</nNF><dhEmi>${dhEmi}</dhEmi><tpNF>1</tpNF><idDest>1</idDest><cMunFG>${issuer.cityCode}</cMunFG><tpImp>4</tpImp><tpEmis>1</tpEmis><cDV>${cDV}</cDV><tpAmb>${tpAmb}</tpAmb><finNFe>1</finNFe><indFinal>1</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>PDVCamaleao_2.0</verProc></ide>`,
    `<emit><CNPJ>${issuer.cnpj}</CNPJ><xNome>${escapeXml(issuer.name)}</xNome><enderEmit><xLgr>${escapeXml(issuer.street)}</xLgr><nro>${escapeXml(issuer.number)}</nro><xBairro>${escapeXml(issuer.district)}</xBairro><cMun>${issuer.cityCode}</cMun><xMun>${escapeXml(issuer.city)}</xMun><UF>SP</UF><CEP>${issuer.postalCode}</CEP><cPais>1058</cPais><xPais>Brasil</xPais></enderEmit><IE>${issuer.ie}</IE><CRT>1</CRT></emit>`,
    dest,
    details,
    `<total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${money(subtotal)}</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>${money(discount)}</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>${money(total)}</vNF><vTotTrib>${money(taxTotal)}</vTotTrib></ICMSTot></total>`,
    `<transp><modFrete>9</modFrete></transp><pag>${paymentXml}${change ? `<vTroco>${money(change)}</vTroco>` : ''}</pag>`,
    `<infAdic><infCpl>Tributos aproximados: R$ ${money(taxTotal)}. Fonte: ${escapeXml(issuer.taxSource)}. Documento emitido por ME ou EPP optante pelo Simples Nacional.</infCpl></infAdic>`,
    `</infNFe><infNFeSupl><qrCode><![CDATA[${qrCodeUrl}]]></qrCode><urlChave>${publicConsultationUrl(environment)}</urlChave></infNFeSupl></NFe>`,
  ].join('');
}
