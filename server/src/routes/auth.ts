import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { generateTokens, comparePassword, verifyRefreshToken, verifyAccessToken } from '../services/auth';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const tenant = await prisma.tenant.findUnique({ where: { email } });
    if (!tenant) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const isValid = await comparePassword(password, tenant.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const tokens = generateTokens({ tenantId: tenant.id });
    res.json({
      ...tokens,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

const pinSchema = z.object({
  userId: z.string().uuid(),
  pin: z.string()
});

router.post('/pin', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação não fornecido ou inválido' });
    }
    
    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (e) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const { userId, pin } = pinSchema.parse(req.body);

    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId: decoded.tenantId, active: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const isValid = await comparePassword(pin, user.pin);
    if (!isValid) {
      return res.status(401).json({ error: 'PIN incorreto. Acesso negado.' });
    }

    const tokens = generateTokens({
      tenantId: decoded.tenantId,
      userId: user.id,
      role: user.role
    });

    res.json({
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos' });
    }
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Verify supervisor (manager or admin) PIN for supervisor actions
router.post('/verify-supervisor', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de autenticação não fornecido' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (e) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const { pin } = z.object({ pin: z.string() }).parse(req.body);

    // Find all active managers or admins in this tenant
    const supervisors = await prisma.user.findMany({
      where: {
        tenantId: decoded.tenantId,
        active: true,
        role: { in: ['admin', 'manager'] }
      }
    });

    for (const supervisor of supervisors) {
      const isMatch = await comparePassword(pin, supervisor.pin);
      if (isMatch) {
        return res.json({
          valid: true,
          supervisor: {
            id: supervisor.id,
            name: supervisor.name,
            role: supervisor.role
          }
        });
      }
    }

    return res.status(401).json({ valid: false, error: 'PIN de supervisor incorreto' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao validar supervisor' });
  }
});

const refreshSchema = z.object({
  refreshToken: z.string()
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);

    const decoded = verifyRefreshToken(refreshToken);

    const tokens = generateTokens({
      tenantId: decoded.tenantId,
      userId: decoded.userId,
      role: decoded.role
    });

    res.json(tokens);
  } catch (error) {
    return res.status(401).json({ error: 'Refresh token inválido ou expirado' });
  }
});

export default router;
