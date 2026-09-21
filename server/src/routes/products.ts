import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const productSchema = z.object({
  name: z.string().min(1),
  barcode: z.string().optional().nullable(),
  sellPrice: z.number().positive(),
  costPrice: z.number().nonnegative().optional().default(0),
  stock: z.number().optional().default(0),
  minStock: z.number().nonnegative().optional().default(5),
  unit: z.string().optional().default('UN'),
  category: z.string().optional().default('Mercearia'),
  quickAccess: z.boolean().optional().default(false),
  color: z.string().optional().nullable(),
  active: z.boolean().optional().default(true),
});

// List products
router.get('/', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      where: { tenantId: req.tenantId!, active: true },
      orderBy: { name: 'asc' },
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

// Create product
router.post('/', async (req, res) => {
  try {
    const data = productSchema.parse(req.body);
    const product = await prisma.product.create({
      data: {
        ...data,
        tenantId: req.tenantId!,
      },
    });
    res.status(201).json(product);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: error.errors });
    }
    res.status(500).json({ error: 'Erro ao criar produto' });
  }
});

// Update product
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = productSchema.parse(req.body);

    const product = await prisma.product.updateMany({
      where: { id, tenantId: req.tenantId! },
      data,
    });

    if (product.count === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }
    res.status(500).json({ error: 'Erro ao atualizar produto' });
  }
});

// Quick stock intake
router.patch('/:id/stock', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = z.object({ quantity: z.number() }).parse(req.body);

    await prisma.product.updateMany({
      where: { id, tenantId: req.tenantId! },
      data: {
        stock: { increment: quantity },
      },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar estoque' });
  }
});

// Soft delete product
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const product = await prisma.product.updateMany({
      where: { id, tenantId: req.tenantId! },
      data: { active: false },
    });

    if (product.count === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao deletar produto' });
  }
});

export default router;
