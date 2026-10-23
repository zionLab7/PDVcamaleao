import { z } from 'zod';
import { Prisma } from '@prisma/client';

export class QuoteError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const text = (max: number) => z.string().trim().max(max).default('');
export const quoteSchema = z.object({
  customerName: z.string().trim().min(1).max(200),
  customerDocument: text(30), customerPhone: text(40), customerEmail: text(200), customerAddress: text(500),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
    const date = new Date(v + 'T12:00:00Z');
    return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === v;
  }, 'Validade inválida'),
  paymentTerms: text(1000), deliveryTerms: text(1000), notes: text(4000),
  status: z.enum(['open', 'accepted', 'declined']).default('open'),
  discount: z.number().finite().nonnegative().max(1e9).default(0),
  version: z.number().int().positive().optional(),
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().finite().positive().max(1e6),
    unitPrice: z.number().finite().positive().max(1e7),
    discount: z.number().finite().nonnegative().max(1e9).default(0),
  })).min(1).max(500),
});

export async function prepareQuote(tx: Prisma.TransactionClient, tenantId: string, input: z.infer<typeof quoteSchema>) {
  const products = await tx.product.findMany({ where: {
    tenantId, active: true, id: { in: input.items.map(i => i.productId) },
  } });
  const items = input.items.map(i => {
    const p = products.find(p => p.id === i.productId);
    if (!p) throw new QuoteError(400, 'Há um produto removido ou indisponível. Revise os itens.');
    const gross = money(i.quantity * i.unitPrice);
    if (money(i.discount) >= gross) throw new QuoteError(400, 'O desconto do item deve ser menor que seu valor.');
    return { ...i, discount: money(i.discount), productName: p.name, barcode: p.barcode || '',
      unit: p.unit, ncm: p.ncm, total: money(gross - i.discount) };
  });
  const subtotal = money(items.reduce((sum, i) => sum + i.total, 0));
  const discount = money(input.discount);
  if (discount >= subtotal) throw new QuoteError(400, 'O desconto deve ser menor que o subtotal.');
  const { version, ...fields } = input;
  return { ...fields, items, subtotal, discount, total: money(subtotal - discount) };
}

export async function lockQuote(tx: Prisma.TransactionClient, tenantId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM "Quote" WHERE id = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
  const quote = await tx.quote.findFirst({ where: { id, tenantId }, include: { sale: { select: { sequenceNumber: true, status: true } } } });
  if (!quote) throw new QuoteError(404, 'Orçamento não encontrado.');
  return quote;
}
export function assertEditable(quote: { status: string; version: number }, version?: number) {
  if (quote.status === 'converted') throw new QuoteError(409, 'Este orçamento já foi convertido em venda.');
  if (version !== quote.version) throw new QuoteError(409, 'Este orçamento foi alterado em outro acesso. Reabra-o para continuar.');
}
