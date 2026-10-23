import { assertEditable, lockQuote, money, QuoteError } from '../services/quotes';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const saleItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().positive(),
  discount: z.number().nonnegative().optional().default(0),
  total: z.number().nonnegative(),
});

const salePaymentSchema = z.object({
  method: z.string(),
  amount: z.number().positive(),
  details: z.any().optional(),
});

const createSaleSchema = z.object({
  items: z.array(saleItemSchema).min(1),
  subtotal: z.number().nonnegative(),
  discount: z.number().nonnegative().optional().default(0),
  total: z.number().nonnegative(),
  payments: z.array(salePaymentSchema).min(1),
  amountPaid: z.number().nonnegative().optional().default(0),
  change: z.number().nonnegative().optional().default(0),
  quoteId: z.string().optional(),
  quoteVersion: z.number().int().positive().optional(),
  customerName: z.string().optional().nullable(),
  customerCpf: z.string().optional().nullable(),
});

// List sales
router.get('/', async (req, res) => {
  try {
    const sales = await prisma.sale.findMany({
      where: { tenantId: req.tenantId! },
      include: {
        items: {
          include: { product: true },
        },
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Format sales to match client Sale interface
    const formatted = sales.map((s) => ({
      id: s.id,
      sequenceNumber: s.sequenceNumber,
      timestamp: s.createdAt.getTime(),
      items: s.items.map((i) => ({
        product: i.product,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discount,
        total: i.total,
      })),
      subtotal: s.subtotal,
      discount: s.discount,
      total: s.total,
      payments: s.payments.map((p) => ({
        method: p.method,
        amount: p.amount,
        details: p.details,
      })),
      amountPaid: s.amountPaid,
      change: s.change,
      operatorId: s.userId || '',
      operatorName: s.operatorName,
      customerName: s.customerName || undefined,
      customerCpf: s.customerCpf || undefined,
      status: s.status,
      synced: true,
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar vendas' });
  }
});

// Create sale
router.post('/', async (req, res) => {
  try {
    const data = createSaleSchema.parse(req.body);

    // Operator info from token
    let operatorName = 'Operador';
    if (req.user?.userId) {
      const u = await prisma.user.findUnique({ where: { id: req.user.userId } });
      if (u) operatorName = u.name;
    }

    const result = await prisma.$transaction(async (tx) => {
      // Same lock order as quote creation; serializes sale numbering per store.
      await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${req.tenantId!} FOR UPDATE`;
      const lastSale = await tx.sale.findFirst({ where: { tenantId: req.tenantId! }, orderBy: { sequenceNumber: 'desc' } });
      const nextSeq = (lastSale?.sequenceNumber || 0) + 1;
      let quote;
      if (data.quoteId) {
        quote = await lockQuote(tx, req.tenantId!, data.quoteId);
        assertEditable(quote, data.quoteVersion);
        if (quote.status === 'declined') throw new QuoteError(400, 'Reabra o orçamento recusado antes de converter.');
        const openRegister = await tx.cashRegister.findFirst({ where: { tenantId: req.tenantId!, isOpen: true } });
        if (!openRegister) throw new QuoteError(400, 'Abra o caixa antes de converter o orçamento.');
        if (data.payments.some(p => !['dinheiro', 'pix', 'debito', 'credito', 'fiado'].includes(p.method)))
          throw new QuoteError(400, 'Forma de pagamento inválida.');
        const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
        if (quote.validUntil < today) throw new QuoteError(400, 'Orçamento vencido. Atualize a validade antes de converter.');
        // Use the saved proposal as the source of truth, never client-provided totals.
        data.items = quote.items as typeof data.items;
        data.subtotal = quote.subtotal;
        data.discount = quote.discount;
        data.total = quote.total;
        data.customerName = data.customerName || quote.customerName;
        data.customerCpf = data.customerCpf || quote.customerDocument;
        const productIds = [...new Set(data.items.map(i => i.productId))];
        const available = await tx.product.count({ where: { tenantId: req.tenantId!, active: true, id: { in: productIds } } });
        if (available !== productIds.length) throw new QuoteError(400, 'Há um produto removido. Edite o orçamento antes de converter.');
        if (Math.abs(money(data.payments.reduce((sum, p) => sum + p.amount, 0)) - data.total) > 0.01)
          throw new QuoteError(400, 'O pagamento difere do total do orçamento.');
        if (Math.abs(money(data.amountPaid - data.change) - data.total) > 0.01)
          throw new QuoteError(400, 'Valor recebido ou troco inválido.');
        // Keep the existing PDV contract: payment amounts are NET; tender/change
        // live in amountPaid/change. They must not be subtracted twice from cash.
        if (data.change > 0 && !data.payments.some(p => p.method === 'dinheiro'))
          throw new QuoteError(400, 'Troco exige pagamento em dinheiro.');
      }
      // 1. Create Sale
      const newSale = await tx.sale.create({
        data: {
          tenantId: req.tenantId!,
          userId: req.user?.userId,
          operatorName,
          sequenceNumber: nextSeq,
          subtotal: data.subtotal,
          discount: data.discount,
          total: data.total,
          amountPaid: data.amountPaid,
          change: data.change,
          customerName: data.customerName,
          customerCpf: data.customerCpf,
          status: 'completed',
          items: {
            create: data.items.map((i) => ({
              tenantId: req.tenantId!,
              productId: i.productId,
              productName: i.productName,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              discount: i.discount,
              total: i.total,
            })),
          },
          payments: {
            create: data.payments.map((p) => ({
              tenantId: req.tenantId!,
              method: p.method,
              amount: p.amount,
              details: p.details || undefined,
            })),
          },
        },
        include: {
          items: {
            include: { product: true },
          },
          payments: true,
        },
      });

      // 2. Decrement stock for sold products
      for (const item of data.items) {
        await tx.product.updateMany({
          where: { id: item.productId, tenantId: req.tenantId! },
          data: {
            stock: { decrement: item.quantity },
          },
        });
      }

      // 3. If there is cash payment, update open cash register balance
      const cashPayments = data.payments.filter((p) => p.method === 'dinheiro');
      if (cashPayments.length > 0) {
        const cashAmount = cashPayments.reduce((acc, p) => acc + p.amount, 0) - (quote ? 0 : (data.change || 0));
        if (cashAmount > 0) {
          const openRegister = await tx.cashRegister.findFirst({
            where: { tenantId: req.tenantId!, isOpen: true },
          });

          if (openRegister) {
            await tx.cashRegister.update({
              where: { id: openRegister.id },
              data: {
                currentBalance: { increment: cashAmount },
              },
            });
          }
        }
      }

      if (quote) {
        await tx.quote.update({ where: { id: quote.id }, data: {
          status: 'converted', saleId: newSale.id, version: { increment: 1 },
        } });
      }
      return newSale;
    });

    // Return client-formatted sale
    const responseSale = {
      id: result.id,
      sequenceNumber: result.sequenceNumber,
      timestamp: result.createdAt.getTime(),
      items: result.items.map((i) => ({
        product: i.product,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discount,
        total: i.total,
      })),
      subtotal: result.subtotal,
      discount: result.discount,
      total: result.total,
      payments: result.payments.map((p) => ({
        method: p.method,
        amount: p.amount,
        details: p.details,
      })),
      amountPaid: result.amountPaid,
      change: result.change,
      operatorId: result.userId || '',
      operatorName: result.operatorName,
      customerName: result.customerName || undefined,
      customerCpf: result.customerCpf || undefined,
      status: result.status,
      synced: true,
    };

    res.status(201).json(responseSale);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: error.errors });
    }
    if (error instanceof QuoteError) return res.status(error.status).json({ error: error.message });
    console.error('Error creating sale:', error);
    res.status(500).json({ error: 'Erro ao registrar venda' });
  }
});

// Cancel sale & restore stock
router.patch('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;

    const sale = await prisma.sale.findFirst({
      where: { id, tenantId: req.tenantId! },
      include: { items: true, payments: true, quote: true },
    });

    if (!sale) {
      return res.status(404).json({ error: 'Venda não encontrada' });
    }

    if (sale.status === 'cancelled') {
      return res.status(400).json({ error: 'Esta venda já está cancelada' });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Mark sale as cancelled
      await tx.sale.update({
        where: { id: sale.id },
        data: { status: 'cancelled' },
      });

      // 2. Restore stock for each item
      for (const item of sale.items) {
        await tx.product.updateMany({
          where: { id: item.productId, tenantId: req.tenantId! },
          data: {
            stock: { increment: item.quantity },
          },
        });
      }

      // 3. Deduct cash if paid in cash
      const cashPayments = sale.payments.filter((p) => p.method === 'dinheiro');
      if (cashPayments.length > 0) {
        const cashAmount = cashPayments.reduce((acc, p) => acc + p.amount, 0) - (sale.quote ? 0 : (sale.change || 0));
        if (cashAmount > 0) {
          const openRegister = await tx.cashRegister.findFirst({
            where: { tenantId: req.tenantId!, isOpen: true },
          });

          if (openRegister) {
            await tx.cashRegister.update({
              where: { id: openRegister.id },
              data: {
                currentBalance: { decrement: cashAmount },
              },
            });
          }
        }
      }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao cancelar venda' });
  }
});

export default router;
