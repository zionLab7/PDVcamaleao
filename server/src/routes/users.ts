import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { authMiddleware } from '../middleware/auth';
import { hashPin } from '../services/auth';

const router = Router();
router.use(authMiddleware);

const userSchema = z.object({
  name: z.string().min(1),
  username: z.string().optional(),
  role: z.enum(['admin', 'manager', 'cashier']),
  pin: z.string().length(4),
  active: z.boolean().default(true)
});

router.get('/', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { tenantId: req.tenantId, active: true },
      select: { id: true, name: true, username: true, role: true, active: true, createdAt: true }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
});

router.post('/', async (req, res) => {
  try {
    const data = userSchema.parse(req.body);
    const hashedPin = await hashPin(data.pin);
    const username = data.username || data.name.toLowerCase().replace(/\s+/g, '') + Math.floor(Math.random() * 1000);

    const user = await prisma.user.create({
      data: {
        tenantId: req.tenantId!,
        name: data.name,
        username,
        role: data.role,
        pin: hashedPin,
        active: data.active
      },
      select: { id: true, name: true, username: true, role: true, active: true }
    });
    res.status(201).json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = z.object({
      name: z.string().min(1).optional(),
      role: z.enum(['admin', 'manager', 'cashier']).optional(),
      pin: z.string().length(4).optional(),
      active: z.boolean().optional()
    }).parse(req.body);

    const updateData: any = { ...data };
    if (data.pin) {
      updateData.pin = await hashPin(data.pin);
    }

    const user = await prisma.user.updateMany({
      where: { id, tenantId: req.tenantId },
      data: updateData
    });

    if (user.count === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.updateMany({
      where: { id, tenantId: req.tenantId },
      data: { active: false }
    });

    if (user.count === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao deletar usuário' });
  }
});

export default router;
