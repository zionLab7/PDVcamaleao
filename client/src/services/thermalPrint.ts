export type PaperWidth = '58mm' | '80mm';

const preferenceKey = 'pdv.thermal-printer.paper-width';

// Printer hardware belongs to this workstation, not to the store's default.
export function getPrinterPaperWidth(fallback: PaperWidth): PaperWidth {
  try {
    const saved = localStorage.getItem(preferenceKey);
    if (saved === '58mm' || saved === '80mm') return saved;
  } catch { /* Printing still works when browser storage is disabled. */ }
  return fallback === '80mm' ? '80mm' : '58mm';
}

export function savePrinterPaperWidth(width: PaperWidth): void {
  try { localStorage.setItem(preferenceKey, width); } catch { /* Optional preference. */ }
}

// Deliberately independent of Tailwind, responsive breakpoints and the POS page.
// Use the same rules for measuring on screen and laying out the printed page.
const receiptCSS = `
  * { box-sizing: border-box; color: #000; background: transparent;
      font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.35;
      text-shadow: none; box-shadow: none; opacity: 1; filter: none;
      margin: 0; padding: 0; max-width: 100%; overflow-wrap: anywhere;
      -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; height: auto; }
  #thermal-receipt { width: 44mm; padding: 2mm 1mm; }
  #thermal-receipt[data-paper-width="80mm"] { width: 68mm; }
  #thermal-receipt > div { padding: 2mm 0; border-bottom: 1px dashed #000; }
  #thermal-receipt > div:last-child { border-bottom: 0; }
  .text-center { text-align: center; }
  .uppercase { text-transform: uppercase; }
  .font-bold, .font-extrabold, .font-black { font-weight: 700; }
  .receipt-title { font-size: 14px; font-weight: 700; }
  .receipt-meta .flex > span { display: block; }
  .receipt-item-header { font-weight: 700; margin-bottom: 1mm; }
  .receipt-item-header > span:last-child { display: none; }
  .receipt-item { margin: 2mm 0; break-inside: avoid; }
  .line-clamp-1 { display: block; overflow: visible; }
  .receipt-amount { display: block; font-weight: 700; white-space: normal; }
  .receipt-item-details .receipt-amount::before { content: "Valor item: "; }
  .receipt-ncm { display: block; }
  .receipt-total, .receipt-total * { font-size: 14px; font-weight: 700; }
  .receipt-total .receipt-amount { display: block; }
  img { display: block; width: 36mm; height: auto; margin: 2mm auto;
        image-rendering: pixelated; break-inside: avoid; }
`;

/** Build the actual print document with an explicit physical page width. */
export async function prepareThermalPrint(source: HTMLElement, width: PaperWidth): Promise<HTMLIFrameElement> {
  const paperMm = width === '80mm' ? 80 : 58;
  const frame = document.createElement('iframe');
  frame.dataset.thermalPrint = 'true';
  frame.title = `Impressão de cupom ${paperMm} mm`;
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = `position:fixed;left:0;top:0;width:${paperMm}mm;height:1px;opacity:0;pointer-events:none;border:0;`;
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument;
    if (!doc) throw new Error('Não foi possível preparar a página de impressão.');
    const loaded = new Promise<void>(resolve => frame.addEventListener('load', () => resolve(), { once: true }));
    doc.open();
    // All sale data is appended as cloned DOM, never interpolated into HTML.
    doc.write('<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Cupom</title></head><body></body></html>');
    doc.close();
    await loaded;
    const style = doc.createElement('style');
    style.textContent = receiptCSS + `html, body { width: ${paperMm}mm; }`;
    doc.head.appendChild(style);
    const receipt = source.cloneNode(true) as HTMLElement;
    receipt.id = 'thermal-receipt';
    receipt.dataset.paperWidth = width;
    doc.body.appendChild(receipt);
    await Promise.all(Array.from(doc.images, image => image.decode()));
    await doc.fonts.ready;
    // CSS requires both dimensions: "58mm auto" is invalid. Measure this
    // dedicated document, then set a valid page size. Long sales paginate.
    const heightMm = Math.min(1000, Math.ceil(receipt.getBoundingClientRect().height * 25.4 / 96) + 4);
    style.textContent += `@page { size: ${paperMm}mm ${heightMm}mm; margin: 0; }`;
    frame.dataset.paperWidth = width;
    frame.dataset.pageHeightMm = String(heightMm);
    return frame;
  } catch (error) {
    frame.remove();
    throw error;
  }
}

export async function printThermalReceipt(source: HTMLElement, width: PaperWidth): Promise<void> {
  const frame = await prepareThermalPrint(source, width);
  const printerWindow = frame.contentWindow;
  if (!printerWindow) { frame.remove(); throw new Error('Página de impressão indisponível.'); }
  await new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const finish = () => { clearTimeout(timer); frame.remove(); resolve(); };
    printerWindow.addEventListener('afterprint', finish, { once: true });
    // Cleanup if a browser omits afterprint. Do not remove before the dialog closes.
    timer = setTimeout(finish, 10 * 60 * 1000);
    try {
      printerWindow.focus();
      printerWindow.print();
    } catch (error) {
      clearTimeout(timer); frame.remove(); reject(error);
    }
  });
}
