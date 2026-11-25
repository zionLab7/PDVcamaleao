import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import JsBarcode from 'jsbarcode';

const namespace = 'http://www.portalfiscal.inf.br/nfe';
const get = (scope: Element | Document | undefined, tag: string) =>
  scope?.getElementsByTagNameNS(namespace, tag).item(0) || undefined;
const value = (scope: Element | Document | undefined, tag: string) => get(scope, tag)?.textContent || '';
const amount = (input: string) => Number(input).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function saveNfeDanfe(xml: string) {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  const note = get(parsed, 'infNFe');
  const protocol = get(parsed, 'infProt');
  const key = value(protocol, 'chNFe');
  if (!/^\d{44}$/.test(key) || note?.getAttribute('Id') !== `NFe${key}`
    || value(note, 'mod') !== '55' || !['100', '150'].includes(value(protocol, 'cStat'))) {
    throw new Error('O XML não corresponde a uma NF-e modelo 55 autorizada.');
  }
  const issuer = get(note, 'emit');
  const recipient = get(note, 'dest');
  const totals = get(note, 'ICMSTot');
  const address = (scope: Element | undefined) =>
    `${value(scope, 'xLgr')}, ${value(scope, 'nro')} · ${value(scope, 'xBairro')} · ${value(scope, 'xMun')}/SP · CEP ${value(scope, 'CEP')}`;
  const barcode = document.createElement('canvas');
  JsBarcode(barcode, key, { format: 'CODE128C', displayValue: false, width: 3, height: 75, margin: 30 });

  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  const number = value(note, 'nNF').padStart(9, '0');
  const series = value(note, 'serie').padStart(3, '0');
  const width = 190;
  const left = 10;
  const money = (tag: string) => amount(value(totals, tag));
  const localDate = (date: string) => date ? new Date(date).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
  const lines = (text: string, x: number, y: number, maxWidth: number, fontSize = 8) => {
    doc.setFontSize(fontSize);
    doc.text(doc.splitTextToSize(text, maxWidth), x, y);
  };
  const box = (title: string, content: string, x: number, y: number, w: number, h = 11) => {
    doc.rect(x, y, w, h);
    lines(title, x + 2, y + 3, w - 4, 6);
    lines(content, x + 2, y + 7, w - 4);
  };
  function header() {
    doc.rect(left, 10, width, 14);
    lines(`Recebemos de ${value(issuer, 'xNome')} os produtos constantes desta NF-e`, 12, 15, 142);
    lines('Data de recebimento ____/____/____   Identificação e assinatura ___________________', 12, 21, 148, 7);
    lines(`NF-e nº ${number}  Série ${series}`, 159, 17, 39, 8);
    doc.rect(10, 27, 65, 34);
    lines('IDENTIFICAÇÃO DO EMITENTE', 12, 32, 61, 7);
    lines(value(issuer, 'xNome'), 12, 37, 61, 9);
    lines(address(issuer), 12, 46, 61, 7);
    doc.rect(75, 27, 36, 34);
    lines('DANFE', 77, 33, 32, 13);
    lines('Documento Auxiliar da Nota Fiscal Eletrônica', 77, 38, 32, 7);
    lines(`1 - SAÍDA\nNº ${number}\nSérie ${series}`, 77, 48, 32, 7);
    doc.rect(111, 27, 89, 34);
    doc.addImage(barcode, 'PNG', 112, 29, 87, 13);
    lines('CHAVE DE ACESSO', 113, 46, 85, 6);
    lines(key.match(/.{4}/g)!.join(' '), 113, 50, 85, 8);
    lines('Consulta de autenticidade no portal nacional da NF-e ou na SEFAZ autorizadora.', 113, 55, 84, 7);
    box('NATUREZA DA OPERAÇÃO', value(note, 'natOp'), 10, 61, 90);
    box('PROTOCOLO DE AUTORIZAÇÃO DE USO', `${value(protocol, 'nProt')} · ${localDate(value(protocol, 'dhRecbto'))}`, 100, 61, 100);
    box('INSCRIÇÃO ESTADUAL', value(issuer, 'IE'), 10, 72, 63);
    box('IE DO SUBSTITUTO TRIBUTÁRIO', value(issuer, 'IEST'), 73, 72, 63);
    box('CNPJ', value(issuer, 'CNPJ'), 136, 72, 64);
    if (value(note, 'tpAmb') === '2') lines('AMBIENTE DE HOMOLOGAÇÃO · SEM VALOR FISCAL', 10, 88, 190, 8);
  }
  const cells = (y: number, fields: [string, string][]) => {
    const w = width / fields.length;
    fields.forEach(([title, text], i) => box(title, text, left + i * w, y, w));
  };
  lines('DESTINATÁRIO / REMETENTE', 10, 93, 190, 8);
  box('RAZÃO SOCIAL', value(recipient, 'xNome'), 10, 95, 102);
  box('CNPJ · IE', `${value(recipient, 'CNPJ')} · ${value(recipient, 'IE') || '—'}`, 112, 95, 51);
  box('EMISSÃO', localDate(value(note, 'dhEmi')), 163, 95, 37);
  box('ENDEREÇO', address(recipient), 10, 106, 190);
  lines('CÁLCULO DO IMPOSTO', 10, 122, 190, 8);
  cells(124, [['BASE ICMS', money('vBC')], ['ICMS', money('vICMS')], ['BASE ICMS ST', money('vBCST')],
    ['ICMS ST', money('vST')], ['TOTAL PRODUTOS', money('vProd')]]);
  cells(135, [['FRETE', money('vFrete')], ['SEGURO', money('vSeg')], ['DESCONTO', money('vDesc')],
    ['OUTRAS DESPESAS', money('vOutro')], ['IPI', money('vIPI')], ['TOTAL NF-e', money('vNF')]]);
  lines('TRANSPORTADOR / VOLUMES TRANSPORTADOS', 10, 152, 190, 8);
  const freightMode = value(note, 'modFrete');
  const freightLabels: Record<string, string> = {
    '3': '3 - Transporte próprio por conta do remetente',
    '4': '4 - Transporte próprio por conta do destinatário',
    '9': '9 - Sem ocorrência de transporte',
  };
  box('MODALIDADE DO FRETE', freightLabels[freightMode] || freightMode, 10, 154, 190);
  const items = Array.from(note.getElementsByTagNameNS(namespace, 'det')).map(item => [
    value(item, 'cProd'), value(item, 'xProd'), value(item, 'NCM'), value(item, 'CSOSN'),
    value(item, 'CFOP'), value(item, 'uCom'), value(item, 'qCom'), amount(value(item, 'vUnCom')),
    amount(value(item, 'vProd')), amount(value(item, 'vDesc')),
  ]);
  autoTable(doc, {
    startY: 171, margin: { top: 94, left, right: 10, bottom: 31 },
    head: [['CÓDIGO', 'DESCRIÇÃO DO PRODUTO', 'NCM', 'CSOSN', 'CFOP', 'UN', 'QTDE', 'V. UNIT.', 'V. TOTAL', 'DESC.']],
    body: items, theme: 'grid', styles: { fontSize: 7, cellPadding: 1.1 },
    headStyles: { fillColor: 255, textColor: 0, lineWidth: 0.2 },
    columnStyles: { 0: { cellWidth: 17 }, 1: { cellWidth: 43 } },
    didDrawPage: () => header(),
  });
  box('INFORMAÇÕES COMPLEMENTARES', value(note, 'infCpl'), 10, 269, 126, 15);
  box('RESERVADO AO FISCO', '', 136, 269, 64, 15);
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    lines(`Folha ${page}/${pages}`, 77, 59, 32, 6);
  }
  doc.save(`DANFE-${key}.pdf`);
}
