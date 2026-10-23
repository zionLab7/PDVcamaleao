import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { authMiddleware } from '../middleware/auth';
import { assertEditable, lockQuote, prepareQuote, quoteSchema, QuoteError } from '../services/quotes';

const router = Router();
router.use(authMiddleware);
const include = { sale: { select: { sequenceNumber: true, status: true } } };
function fail(res: any, error: unknown) {
  if (error instanceof z.ZodError) return res.status(400).json({ error: 'Revise os campos obrigatórios, a validade e os valores dos itens.', details: error.errors });
  if (error instanceof QuoteError) return res.status(error.status).json({ error: error.message });
  console.error('Quote error:', error);
  return res.status(500).json({ error: 'Não foi possível salvar ou consultar o orçamento.' });
}
router.get('/', async (req, res) => {
  try {
    res.json(await prisma.quote.findMany({ where: { tenantId: req.tenantId! }, include, orderBy: { createdAt: 'desc' } }));
  } catch (error) { fail(res, error); }
});
router.get('/:id', async (req, res) => {
  try {
    const quote = await prisma.quote.findFirst({ where: { id: req.params.id, tenantId: req.tenantId! }, include });
    if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado.' });
    res.json(quote);
  } catch (error) { fail(res, error); }
});
router.post('/', async (req, res) => {
  try {
    const input = quoteSchema.parse(req.body);
    const quote = await prisma.$transaction(async tx => {
      // Serialize numbering per tenant; no collisions when two operators save together.
      await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${req.tenantId!} FOR UPDATE`;
      const data = await prepareQuote(tx, req.tenantId!, input);
      const last = await tx.quote.aggregate({ where: { tenantId: req.tenantId! }, _max: { number: true } });
      const operator = req.user ? await tx.user.findFirst({ where: { id: req.user.userId, tenantId: req.tenantId! } }) : null;
      return tx.quote.create({ data: { ...data, tenantId: req.tenantId!, number: (last._max.number || 0) + 1, operatorName: operator?.name || 'Operador' }, include });
    });
    res.status(201).json(quote);
  } catch (error) { fail(res, error); }
});
router.put('/:id', async (req, res) => {
  try {
    const input = quoteSchema.parse(req.body);
    const quote = await prisma.$transaction(async tx => {
      const current = await lockQuote(tx, req.tenantId!, req.params.id);
      assertEditable(current, input.version);
      const data = await prepareQuote(tx, req.tenantId!, input);
      return tx.quote.update({ where: { id: current.id }, data: { ...data, version: { increment: 1 } }, include });
    });
    res.json(quote);
  } catch (error) { fail(res, error); }
});
export default router;
