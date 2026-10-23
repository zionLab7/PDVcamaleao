import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Quote, StoreSettings } from '../types';

const money = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Standard PDF fonts support Portuguese/WinAnsi. Normalize pasted Unicode punctuation.
const text = (v: unknown) => String(v ?? '').replace(/[\u2010-\u2015]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[^\x20-\x7e\xa0-\xff\n]/g, '');
const date = (v: string) => v.slice(0, 10).split('-').reverse().join('/');
const issued = (v: string) => new Date(v).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

export function buildQuotePdf(quote: Quote, store: StoreSettings): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const number = String(quote.number).padStart(6, '0');
  doc.setProperties({ title: `Orçamento ${number} - ${text(quote.customerName)}`, author: text(store.storeName) });
  const base = { font: 'helvetica', fontSize: 9, cellPadding: 2.2, textColor: [20, 30, 40] as [number, number, number], overflow: 'linebreak' as const };
  let y = 16;
  function table(body: string[][], widths?: Record<number, { cellWidth: number }>, header?: string[]) {
    autoTable(doc, { startY: y, margin: { left: 14, right: 14, top: 16, bottom: 17 },
      theme: 'plain', styles: base, body: body.map(row => row.map(text)),
      head: header ? [[{ content: header[0], colSpan: 2 }]] : undefined,
      headStyles: { fillColor: [22, 44, 52], textColor: 255, fontStyle: 'bold' },
      columnStyles: widths,
      didParseCell: cell => {
        if (cell.section === 'body' && cell.row.index === 0 && y === 16) { cell.cell.styles.fontStyle = 'bold'; cell.cell.styles.fontSize = 12; }
        if (cell.section === 'body' && cell.row.raw && (cell.row.raw as string[])[0] === 'TOTAL DO ORÇAMENTO') { cell.cell.styles.fontStyle = 'bold'; cell.cell.styles.fillColor = [232, 245, 239]; }
      },
    });
    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  }
  doc.setFont('helvetica', 'bold').setFontSize(17).setTextColor(18, 61, 51);
  // Store name is laid out by AutoTable to wrap safely rather than clip.
  table([[store.tradeName || store.storeName, `ORÇAMENTO Nº ${number}`],
    [[store.document && `CNPJ/CPF: ${store.document}`, store.phone && `Tel.: ${store.phone}`, store.address, store.city].filter(Boolean).join('\n'),
      `Emissão: ${issued(quote.createdAt)}\nValidade: ${date(quote.validUntil)}\nResponsável: ${quote.operatorName}`]], { 0: { cellWidth: 110 }, 1: { cellWidth: 72 } });
  table([['Cliente', quote.customerName], ['CPF/CNPJ', quote.customerDocument || '-'],
    ['Contato', [quote.customerPhone, quote.customerEmail].filter(Boolean).join(' | ') || '-'],
    ['Endereço', quote.customerAddress || '-']], { 0: { cellWidth: 24 }, 1: { cellWidth: 158 } }, ['DADOS DO CLIENTE', '']);
  autoTable(doc, {
    startY: y, margin: { left: 14, right: 14, top: 16, bottom: 17 },
    styles: { ...base, fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: [22, 44, 52], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 248, 247] },
    head: [['CÓDIGO', 'DESCRIÇÃO / NCM', 'UN', 'QTDE', 'UNIT. R$', 'DESC. R$', 'TOTAL R$']],
    body: quote.items.map(i => [text(i.barcode || i.productId.slice(0, 8)), text(`${i.productName}${i.ncm ? `\nNCM: ${i.ncm}` : ''}`), text(i.unit),
      i.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 4 }), money(i.unitPrice), money(i.discount), money(i.total)]),
    columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 59 }, 2: { cellWidth: 10 }, 3: { cellWidth: 16, halign: 'right' },
      4: { cellWidth: 24, halign: 'right' }, 5: { cellWidth: 23, halign: 'right' }, 6: { cellWidth: 25, halign: 'right', fontStyle: 'bold' } },
    rowPageBreak: 'avoid', showHead: 'everyPage',
  });
  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
  table([['Subtotal dos itens (descontos por item já aplicados)', `R$ ${money(quote.subtotal)}`],
    ['Desconto adicional', `R$ ${money(quote.discount)}`], ['TOTAL DO ORÇAMENTO', `R$ ${money(quote.total)}`]],
    { 0: { cellWidth: 145 }, 1: { cellWidth: 37 } });
  table([['Pagamento', quote.paymentTerms || 'A combinar'], ['Entrega', quote.deliveryTerms || 'A combinar'],
    ['Observações', quote.notes || '-'], ['Condições', 'Proposta comercial válida até a data indicada. Sujeita à disponibilidade de estoque. Este documento não é nota fiscal nem comprovante de pagamento.']],
    { 0: { cellWidth: 25 }, 1: { cellWidth: 157 } }, ['CONDIÇÕES DA PROPOSTA', '']);
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page).setDrawColor(180).setLineWidth(0.2).line(14, 283, 196, 283);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(70);
    doc.text(doc.splitTextToSize(`Orçamento ${number} | ${text(store.storeName)}`, 145)[0], 14, 288);
    doc.text(`Página ${page} de ${pages}`, 196, 288, { align: 'right' });
  }
  return doc;
}
export function downloadQuotePdf(quote: Quote, store: StoreSettings) {
  buildQuotePdf(quote, store).save(`orcamento-${String(quote.number).padStart(6, '0')}.pdf`);
}
