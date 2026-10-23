import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
const product = { id: 'product-1', name: 'Café Tradicional 500g', barcode: '7891234567890', unit: 'UN', ncm: '09012100', sellPrice: 12.50, stock: 100, minStock: 5, costPrice: 8, category: 'Mercearia' };
const secondProduct = { ...product, id: 'product-2', name: 'Açúcar Cristal 1kg', barcode: '7899999999999', sellPrice: 5 };
const store = { storeName: 'Distribuidora GP Brasil', tradeName: 'GP Brasil', document: '12.345.678/0001-90', address: 'Rua Exemplo, 123 - Centro', city: 'Guarulhos / SP', phone: '(11) 99999-9999', receiptWidth: '58mm', enableSound: false };
function quote(items = 1) {
  return { id: 'quote-1', number: 15, version: 1, customerName: 'Cliente Exemplo Ltda.', customerDocument: '98.765.432/0001-10', customerPhone: '(11) 98888-8888',
    customerEmail: 'compras@cliente.com.br', customerAddress: 'Rua dos Clientes, 456 - São Paulo / SP', validUntil: '2099-12-31', status: 'open',
    paymentTerms: 'PIX à vista ou cartão em até 3x.', deliveryTerms: 'Retirada na loja em até 2 dias úteis.', notes: 'Confirmar disponibilidade dos produtos antes do pagamento.',
    operatorName: 'Rodrigo Sampaio', createdAt: '2026-10-23T12:00:00Z', updatedAt: '2026-10-23T12:00:00Z', subtotal: 25 * items, discount: 5, total: 25 * items - 5,
    items: Array.from({ length: items }, (_, n) => ({ productId: product.id, productName: items > 1 ? `PRODUTO ${n + 1} - Café Tradicional com descrição completa para verificação de quebra de linha e paginação` : product.name,
      barcode: product.barcode, ncm: product.ncm, unit: 'UN', quantity: 2, unitPrice: 12.5, discount: 0, total: 25 })) };
}
async function setup(page: Page, initial: any[] = []) {
  let quotes = initial;
  let sequence = 20;
  const submissions: any[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('pdv_access_token', 'test-token'); localStorage.setItem('pdv_operator', JSON.stringify({ id: 'user-1', name: 'Rodrigo', role: 'admin', username: 'rodrigo' }));
  });
  await page.route('**/api/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname.replace('/api', '');
    let body: any = {};
    if (path === '/products') body = [product, secondProduct];
    else if (path === '/settings') body = store;
    else if (path === '/users') body = [];
    else if (path === '/cash-register') body = { isOpen: true, currentBalance: 0, initialAmount: 0, movements: [] };
    else if (path === '/sales' && req.method() === 'GET') body = [];
    else if (path === '/sales' && req.method() === 'POST') {
      const data = req.postDataJSON(); submissions.push(data);
      quotes = quotes.map(q => q.id === data.quoteId ? { ...q, status: 'converted', saleId: 'sale-1', sale: { sequenceNumber: 10, status: 'completed' } } : q);
      body = { ...data, id: 'sale-1', sequenceNumber: 10, timestamp: Date.now(), status: 'completed', synced: true,
        items: data.items.map((i: any) => ({ ...i, product: { ...product, name: i.productName } })), operatorName: 'Rodrigo' };
    } else if (path === '/quotes' && req.method() === 'GET') body = quotes;
    else if (path.startsWith('/quotes') && ['POST', 'PUT'].includes(req.method())) {
      const data = req.postDataJSON(); const subtotal = data.items.reduce((sum: number, i: any) => sum + i.total, 0);
      body = { ...data, id: data.id || `quote-${++sequence}`, number: data.number || sequence, version: (data.version || 0) + 1,
        subtotal, total: subtotal - data.discount, operatorName: 'Rodrigo', createdAt: data.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
      quotes = [body, ...quotes.filter(q => q.id !== body.id)];
    } else if (path.startsWith('/quotes/')) body = quotes.find(q => q.id === path.split('/')[2]);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/'); await page.getByRole('button', { name: 'Orçamentos', exact: true }).click();
  return { submissions };
}
test('create, edit products and discounts, persist after reload, download actual A4 PDF', async ({ page }, info) => {
  await setup(page);
  await page.getByRole('button', { name: 'Novo orçamento' }).click();
  await page.getByLabel('Cliente / razão social *').fill('Maria Comércio Ltda.');
  await page.getByLabel('CPF / CNPJ', { exact: true }).fill('12345678000190');
  await page.getByLabel('Adicionar produto').fill('Café'); await page.getByRole('button', { name: /Café Tradicional 500g/ }).click();
  await page.getByLabel('Quantidade 1', { exact: true }).fill('3');
  await page.getByLabel('Adicionar produto').fill('Açúcar'); await page.getByRole('button', { name: /Açúcar Cristal/ }).click();
  await page.getByLabel('Remover item 2').click();
  await page.getByLabel('Desconto adicional R$').fill('2.50');
  await page.getByLabel('Condições de pagamento').fill('PIX à vista.');
  await page.getByRole('button', { name: 'Salvar orçamento', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Orçamento salvo.');
  await page.reload(); await page.getByRole('button', { name: 'Orçamentos', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Maria Comércio Ltda.' })).toBeVisible();
  await expect(page.getByRole('cell', { name: /35,00/ })).toBeVisible();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: /Baixar PDF do orçamento/ }).click();
  const pdf = await download; await pdf.saveAs(info.outputPath('quote.pdf')); expect(pdf.suggestedFilename()).toMatch(/orcamento-\d+\.pdf/);
  const bytes = await fs.readFile(info.outputPath('quote.pdf')); expect(bytes.subarray(0, 4).toString()).toBe('%PDF');
  await info.attach('quote.pdf', { path: info.outputPath('quote.pdf'), contentType: 'application/pdf' });
});
test('edit accepted proposal before checkout and convert through the normal payment flow', async ({ page }, info) => {
  const { submissions } = await setup(page, [quote()]);
  await page.getByRole('button', { name: 'Abrir / editar' }).click();
  await page.getByLabel('Quantidade 1', { exact: true }).fill('3');
  await page.getByLabel('Adicionar produto').fill('Açúcar'); await page.getByRole('button', { name: /Açúcar Cristal/ }).click();
  await page.getByLabel('Remover item 1').click();
  await page.getByLabel('Desconto adicional R$').fill('1');
  await page.getByLabel('Situação', { exact: true }).selectOption('accepted');
  await page.screenshot({ path: info.outputPath('quote-editor.png'), fullPage: true });
  await page.getByRole('button', { name: 'Converter em venda' }).click();
  await expect(page.getByRole('button', { name: 'Confirmar Recebimento' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar Recebimento' }).click();
  await expect(page.getByRole('table').getByText('Convertido', { exact: true })).toBeVisible();
  expect(submissions).toHaveLength(1); expect(submissions[0].total).toBe(4);
  expect(submissions[0].items[0].productId).toBe(secondProduct.id); expect(submissions[0].customerName).toBe('Cliente Exemplo Ltda.');
});
for (const count of [1, 80]) test(`PDF A4 with ${count} items downloads, including long fields and notes`, async ({ page }, info) => {
  const q = quote(count);
  if (count > 1) { q.notes = ('Observação com informações comerciais e caracteres acentuados. ').repeat(50); q.customerAddress = ('Endereço de entrega completo, bloco e complemento. ').repeat(6); }
  await setup(page, [q]);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: /Baixar PDF do orçamento/ }).click();
  await (await download).saveAs(info.outputPath(`quote-${count}.pdf`));
  await info.attach(`quote-${count}.pdf`, { path: info.outputPath(`quote-${count}.pdf`), contentType: 'application/pdf' });
});
test('filters expired quotes and keeps converted ones read-only with sale link', async ({ page }, info) => {
  const old = { ...quote(), id: 'expired', number: 1, validUntil: '2020-01-01' };
  const converted = { ...quote(), id: 'converted', number: 2, status: 'converted', saleId: 'sale-1', sale: { sequenceNumber: 10, status: 'completed' } };
  await setup(page, [old, converted]);
  await page.getByLabel('Filtrar situação').selectOption('expired'); await expect(page.getByRole('cell', { name: 'Vencido' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Visualizar', exact: true })).toHaveCount(0);
  await page.getByLabel('Filtrar situação').selectOption('converted'); await page.getByRole('button', { name: 'Visualizar', exact: true }).click();
  await expect(page.getByLabel('Cliente / razão social *')).toBeDisabled(); await expect(page.getByRole('button', { name: 'Converter em venda' })).toHaveCount(0);
  await expect(page.getByText('Convertido em venda #10.', { exact: false })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: info.outputPath('mobile.png'), fullPage: true });
});
