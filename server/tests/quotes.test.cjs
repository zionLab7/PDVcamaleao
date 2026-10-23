// Run against a disposable database only. Creates and removes its own two tenants.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { prisma } = require('../dist/prisma');
const { generateTokens } = require('../dist/services/auth');
let server, url, a, b, product, foreign, register, token, otherToken;
const future = '2099-12-31';
async function request(path, method = 'GET', data, auth = token) {
  const response = await fetch(url + path, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: data ? JSON.stringify(data) : undefined });
  return { status: response.status, body: await response.json() };
}
function payload(extra = {}) { return { customerName: 'Cliente Teste', customerDocument: '12345678901', validUntil: future,
  items: [{ productId: product.id, quantity: 2, unitPrice: 10, discount: 1 }], discount: 2, ...extra }; }
async function create(extra) { const r = await request('/quotes', 'POST', payload(extra)); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body; }
function sale(q, extra = {}) { return { quoteId: q.id, quoteVersion: q.version, items: q.items, subtotal: q.subtotal, discount: q.discount, total: q.total,
  payments: [{ method: 'dinheiro', amount: q.total }], amountPaid: 30, change: 30 - q.total, ...extra }; }
before(async () => {
  assert.ok(process.env.DATABASE_URL, 'Use an isolated test DATABASE_URL');
  const suffix = `${Date.now()}-${Math.random()}`;
  a = await prisma.tenant.create({ data: { name: 'Quote test A', email: `quote-a-${suffix}@test.invalid`, password: 'test' } });
  b = await prisma.tenant.create({ data: { name: 'Quote test B', email: `quote-b-${suffix}@test.invalid`, password: 'test' } });
  token = generateTokens({ tenantId: a.id }).accessToken; otherToken = generateTokens({ tenantId: b.id }).accessToken;
  product = await prisma.product.create({ data: { tenantId: a.id, name: 'Café Tradicional', barcode: '123', sellPrice: 10, stock: 100 } });
  foreign = await prisma.product.create({ data: { tenantId: b.id, name: 'Outro produto', sellPrice: 20 } });
  register = await prisma.cashRegister.create({ data: { tenantId: a.id, isOpen: true, currentBalance: 0 } });
  const app = express(); app.use(express.json());
  app.use('/quotes', require('../dist/routes/quotes').default); app.use('/sales', require('../dist/routes/sales').default);
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (a && b) {
    await prisma.quote.deleteMany({ where: { tenantId: { in: [a.id, b.id] } } });
    await prisma.sale.deleteMany({ where: { tenantId: { in: [a.id, b.id] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  }
  await prisma.$disconnect();
});
test('requires authentication and prevents cross-store products and quote access', async () => {
  assert.equal((await request('/quotes', 'GET', null, '')).status, 401);
  const q = await create();
  assert.equal((await request(`/quotes/${q.id}`, 'GET', null, otherToken)).status, 404);
  assert.deepEqual((await request('/quotes', 'GET', null, otherToken)).body, []);
  assert.equal((await request('/quotes', 'POST', payload({ items: [{ productId: foreign.id, quantity: 1, unitPrice: 1 }] }))).status, 400);
  assert.equal((await request('/sales', 'POST', sale(q), otherToken)).status, 404);
});
test('persists canonical totals and snapshots without moving stock, cash or sales', async () => {
  const stock = (await prisma.product.findUnique({ where: { id: product.id } })).stock;
  const count = await prisma.sale.count({ where: { tenantId: a.id } });
  const balance = (await prisma.cashRegister.findUnique({ where: { id: register.id } })).currentBalance;
  const q = await create({ subtotal: 9999, total: 1 });
  assert.equal(q.subtotal, 19); assert.equal(q.total, 17); assert.equal(q.items[0].productName, product.name);
  await prisma.product.update({ where: { id: product.id }, data: { name: 'Changed catalog name', sellPrice: 999 } });
  const saved = (await request(`/quotes/${q.id}`)).body;
  assert.equal(saved.items[0].productName, product.name); assert.equal(saved.items[0].unitPrice, 10);
  assert.equal((await prisma.product.findUnique({ where: { id: product.id } })).stock, stock);
  assert.equal(await prisma.sale.count({ where: { tenantId: a.id } }), count);
  assert.equal((await prisma.cashRegister.findUnique({ where: { id: register.id } })).currentBalance, balance);
});
test('supports edits, added/removed items, version conflicts and sequential numbers', async () => {
  const q = await create();
  const updated = await request(`/quotes/${q.id}`, 'PUT', { ...q, items: [{ productId: product.id, quantity: 3, unitPrice: 5, discount: 0 }], discount: 0, status: 'accepted' });
  assert.equal(updated.status, 200); assert.equal(updated.body.total, 15); assert.equal(updated.body.version, q.version + 1);
  assert.equal((await request(`/quotes/${q.id}`, 'PUT', q)).status, 409);
  const next = await create(); assert.equal(next.number, q.number + 1);
});
test('rejects invalid dates, discounts, empty items and nonpositive quantities', async () => {
  for (const fields of [{ validUntil: '2026-02-30' }, { items: [] }, { discount: 20 },
    { items: [{ productId: product.id, quantity: 0, unitPrice: 10 }] }, { items: [{ productId: product.id, quantity: 1, unitPrice: 10, discount: 11 }] }]) {
    assert.equal((await request('/quotes', 'POST', payload(fields))).status, 400);
  }
});
test('converts with canonical saved contents, moves net cash once, links sale, rejects duplicate conversion and edits', async () => {
  const q = await create();
  const stock = (await prisma.product.findUnique({ where: { id: product.id } })).stock;
  const cash = (await prisma.cashRegister.findUnique({ where: { id: register.id } })).currentBalance;
  const results = await Promise.all([request('/sales', 'POST', sale(q, { subtotal: 1, total: 1 })), request('/sales', 'POST', sale(q))]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  const converted = (await request(`/quotes/${q.id}`)).body;
  const created = results.find(r => r.status === 201).body;
  assert.equal(created.total, 17); assert.equal(created.customerName, q.customerName); assert.equal(created.customerCpf, q.customerDocument);
  assert.equal(converted.status, 'converted'); assert.equal(converted.saleId, created.id);
  assert.equal((await prisma.product.findUnique({ where: { id: product.id } })).stock, stock - 2);
  assert.equal((await prisma.cashRegister.findUnique({ where: { id: register.id } })).currentBalance, cash + 17);
  assert.equal((await request(`/quotes/${q.id}`, 'PUT', q)).status, 409);
  assert.equal((await request(`/sales/${created.id}/cancel`, 'PATCH')).status, 200);
  assert.equal((await prisma.product.findUnique({ where: { id: product.id } })).stock, stock);
  assert.equal((await prisma.cashRegister.findUnique({ where: { id: register.id } })).currentBalance, cash);
  assert.equal((await request(`/quotes/${q.id}`)).body.status, 'converted');
});
test('failed payment and obsolete version leave proposal, stock and sales untouched', async () => {
  const q = await create(); const count = await prisma.sale.count({ where: { tenantId: a.id } });
  const stock = (await prisma.product.findUnique({ where: { id: product.id } })).stock;
  assert.equal((await request('/sales', 'POST', sale(q, { payments: [{ method: 'pix', amount: 1 }] }))).status, 400);
  assert.equal((await request('/sales', 'POST', sale(q, { quoteVersion: 999 }))).status, 409);
  assert.equal((await request(`/quotes/${q.id}`)).body.status, 'open');
  assert.equal(await prisma.sale.count({ where: { tenantId: a.id } }), count);
  assert.equal((await prisma.product.findUnique({ where: { id: product.id } })).stock, stock);
});
test('expired, declined, inactive products and closed cash register block conversion', async () => {
  assert.equal((await request('/sales', 'POST', sale(await create({ validUntil: '2020-01-01' })))).status, 400);
  assert.equal((await request('/sales', 'POST', sale(await create({ status: 'declined' })))).status, 400);
  const q = await create();
  await prisma.product.update({ where: { id: product.id }, data: { active: false } });
  assert.equal((await request('/sales', 'POST', sale(q))).status, 400);
  await prisma.product.update({ where: { id: product.id }, data: { active: true } });
  await prisma.cashRegister.update({ where: { id: register.id }, data: { isOpen: false } });
  assert.equal((await request('/sales', 'POST', sale(q))).status, 400);
  await prisma.cashRegister.update({ where: { id: register.id }, data: { isOpen: true } });
});
test('PIX conversion leaves cash balance unchanged and regular POS sale still works', async () => {
  const q = await create(); const cash = (await prisma.cashRegister.findUnique({ where: { id: register.id } })).currentBalance;
  const result = await request('/sales', 'POST', sale(q, { payments: [{ method: 'pix', amount: q.total }], amountPaid: q.total, change: 0 }));
  assert.equal(result.status, 201); assert.equal((await prisma.cashRegister.findUnique({ where: { id: register.id } })).currentBalance, cash);
  const regular = sale(q, { quoteId: undefined, quoteVersion: undefined, payments: [{ method: 'pix', amount: q.total }], amountPaid: q.total, change: 0 });
  assert.equal((await request('/sales', 'POST', regular)).status, 201);
});
