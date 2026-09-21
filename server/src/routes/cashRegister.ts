import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// Get current cash register state
router.get('/', async (req, res) => {
  try {
    let register = await prisma.cashRegister.findFirst({
      where: { tenantId: req.tenantId! },
      orderBy: { createdAt: 'desc' },
      include: {
        movements: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // If no register exists yet, create an initial open register with 0 balance
    if (!register) {
      register = await prisma.cashRegister.create({
        data: {
          tenantId: req.tenantId!,
          isOpen: true,
          initialAmount: 0,
          currentBalance: 0,
          openedBy: 'Sistema',
        },
        include: { movements: true },
      });
    }

    const formatted = {
      isOpen: register.isOpen,
      openedAt: register.openedAt.getTime(),
      closedAt: register.closedAt?.getTime(),
      openedBy: register.openedBy || 'Operador',
      initialAmount: register.initialAmount,
      currentBalance: register.currentBalance,
      movements: register.movements.map((m) => ({
        id: m.id,
        timestamp: m.createdAt.getTime(),
        type: m.type,
        amount: m.amount,
        reason: m.reason,
        operatorId: m.userId || '',
        operatorName: m.operatorName,
      })),
    };

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao consultar caixa' });
  }
});

// Open register
router.post('/open', async (req, res) => {
  try {
    const { initialAmount } = z.object({
      initialAmount: z.number().nonnegative().default(0),
    }).parse(req.body);

    let operatorName = 'Operador';
    if (req.user?.userId) {
      const u = await prisma.user.findUnique({ where: { id: req.user.userId } });
      if (u) operatorName = u.name;
    }

    const register = await prisma.cashRegister.create({
      data: {
        tenantId: req.tenantId!,
        isOpen: true,
        initialAmount,
        currentBalance: initialAmount,
        openedBy: operatorName,
        movements: {
          create: {
            tenantId: req.tenantId!,
            userId: req.user?.userId,
            operatorName,
            type: 'opening',
            amount: initialAmount,
            reason: 'Fundo de troco inicial',
          },
        },
      },
    });

    res.status(201).json({ success: true, register });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }
    res.status(500).json({ error: 'Erro ao abrir caixa' });
  }
});

// Close register
router.post('/close', async (req, res) => {
  try {
    const register = await prisma.cashRegister.findFirst({
      where: { tenantId: req.tenantId!, isOpen: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!register) {
      return res.status(400).json({ error: 'Nenhum caixa aberto para fechar' });
    }

    let operatorName = 'Operador';
    if (req.user?.userId) {
      const u = await prisma.user.findUnique({ where: { id: req.user.userId } });
      if (u) operatorName = u.name;
    }

    await prisma.$transaction(async (tx) => {
      await tx.cashMovement.create({
        data: {
          tenantId: req.tenantId!,
          cashRegisterId: register.id,
          userId: req.user?.userId,
          operatorName,
          type: 'closing',
          amount: register.currentBalance,
          reason: 'Fechamento de Caixa',
        },
      });

      await tx.cashRegister.update({
        where: { id: register.id },
        data: {
          isOpen: false,
          closedAt: new Date(),
        },
      });
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao fechar caixa' });
  }
});

// Add movement (Sangria / Suprimento)
router.post('/movement', async (req, res) => {
  try {
    const { type, amount, reason } = z.object({
      type: z.enum(['inflow', 'outflow']),
      amount: z.number().positive(),
      reason: z.string().min(1),
    }).parse(req.body);

    const register = await prisma.cashRegister.findFirst({
      where: { tenantId: req.tenantId!, isOpen: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!register) {
      return res.status(400).json({ error: 'O caixa precisa estar aberto para registrar movimentação' });
    }

    if (type === 'outflow' && amount > register.currentBalance) {
      return res.status(400).json({ error: 'Valor da sangria excede o saldo da gaveta' });
    }

    let operatorName = 'Operador';
    if (req.user?.userId) {
      const u = await prisma.user.findUnique({ where: { id: req.user.userId } });
      if (u) operatorName = u.name;
    }

    const delta = type === 'inflow' ? amount : -amount;

    await prisma.$transaction(async (tx) => {
      await tx.cashMovement.create({
        data: {
          tenantId: req.tenantId!,
          cashRegisterId: register.id,
          userId: req.user?.userId,
          operatorName,
          type,
          amount,
          reason,
        },
      });

      await tx.cashRegister.update({
        where: { id: register.id },
        data: {
          currentBalance: { increment: delta },
        },
      });
    });

    res.status(201).json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }
    res.status(500).json({ error: 'Erro ao registrar movimentação' });
  }
});

export default router;
