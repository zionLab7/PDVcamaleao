import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const defaultCategories = [
  { name: 'Mercearia', color: '#10b981' },
  { name: 'Bebidas', color: '#3b82f6' },
  { name: 'Padaria & Confeitaria', color: '#f59e0b' },
  { name: 'Hortifrúti / Feira', color: '#22c55e' },
  { name: 'Açougue & Carnes', color: '#ef4444' },
  { name: 'Laticínios & Frios', color: '#06b6d4' },
  { name: 'Limpeza', color: '#8b5cf6' },
  { name: 'Higiene & Cuidados', color: '#ec4899' },
  { name: 'Doces & Snacks', color: '#f97316' },
  { name: 'Outros', color: '#64748b' },
];

// List categories
router.get('/', async (req, res) => {
  try {
    let categories = await prisma.category.findMany({
      where: { tenantId: req.tenantId! },
      orderBy: { name: 'asc' },
    });

    // Se o comércio ainda não tem categorias cadastradas, inicializar com as padrão
    if (categories.length === 0) {
      // Também verifica se já existem produtos com categorias avulsas
      const existingProductCats = await prisma.product.findMany({
        where: { tenantId: req.tenantId!, active: true },
        select: { category: true },
        distinct: ['category'],
      });

      const catNames = new Set(defaultCategories.map((c) => c.name));
      existingProductCats.forEach((p) => {
        if (p.category && p.category.trim()) {
          catNames.add(p.category.trim());
        }
      });

      for (const name of catNames) {
        const foundDefault = defaultCategories.find((c) => c.name === name);
        await prisma.category.create({
          data: {
            tenantId: req.tenantId!,
            name,
            color: foundDefault?.color || '#10b981',
          },
        }).catch(() => {});
      }

      categories = await prisma.category.findMany({
        where: { tenantId: req.tenantId! },
        orderBy: { name: 'asc' },
      });
    }

    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar categorias' });
  }
});

const categorySchema = z.object({
  name: z.string().min(1, 'Nome da categoria é obrigatório'),
  color: z.string().optional().default('#10b981'),
});

// Create new category
router.post('/', async (req, res) => {
  try {
    const { name, color } = categorySchema.parse(req.body);

    const cleanName = name.trim();

    // Check if category already exists for this tenant
    const existing = await prisma.category.findFirst({
      where: {
        tenantId: req.tenantId!,
        name: { equals: cleanName, mode: 'insensitive' },
      },
    });

    if (existing) {
      return res.status(409).json({ error: 'Esta categoria já existe.' });
    }

    const category = await prisma.category.create({
      data: {
        tenantId: req.tenantId!,
        name: cleanName,
        color,
      },
    });

    res.status(201).json(category);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
});

// Update category
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color } = categorySchema.parse(req.body);
    const cleanName = name.trim();

    const current = await prisma.category.findFirst({
      where: { id, tenantId: req.tenantId! },
    });

    if (!current) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    const updated = await prisma.category.update({
      where: { id },
      data: { name: cleanName, color },
    });

    // Se o nome da categoria mudou, atualizar todos os produtos que usavam o nome antigo!
    if (current.name !== cleanName) {
      await prisma.product.updateMany({
        where: {
          tenantId: req.tenantId!,
          category: current.name,
        },
        data: {
          category: cleanName,
        },
      });
    }

    res.json(updated);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(500).json({ error: 'Erro ao atualizar categoria' });
  }
});

// Delete category
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const current = await prisma.category.findFirst({
      where: { id, tenantId: req.tenantId! },
    });

    if (!current) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    await prisma.category.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir categoria' });
  }
});

export default router;
