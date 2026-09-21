import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { createTenantData } from '../createTenant';

const router = Router();

// Middleware de autenticação por Chave Mestra
router.use((req, res, next) => {
  const masterKey = process.env.ADMIN_KEY || process.env.JWT_SECRET || 'pdv_secret_admin_key_2026';
  const providedKey = req.headers['x-admin-key'];

  if (!providedKey || providedKey !== masterKey) {
    return res.status(403).json({ error: 'Acesso não autorizado. Chave mestra inválida.' });
  }

  next();
});

const createTenantSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(4, 'Senha deve ter pelo menos 4 caracteres'),
  ownerName: z.string().optional().default('Administrador'),
  adminPin: z.string().optional().default('1234'),
  document: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  plan: z.string().optional().default('pro')
});

// Criar novo comércio (tenant)
router.post('/tenants', async (req, res) => {
  try {
    const data = createTenantSchema.parse(req.body);
    const tenant = await createTenantData(data);

    res.status(201).json({
      message: 'Comércio criado com sucesso',
      tenant: {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        document: tenant.document,
        phone: tenant.phone,
        plan: tenant.plan,
        createdAt: tenant.createdAt
      }
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    res.status(400).json({ error: error.message || 'Erro ao criar comércio' });
  }
});

// Listar todos os comércios cadastrados
router.get('/tenants', async (req, res) => {
  try {
    const tenants = await prisma.tenant.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        document: true,
        phone: true,
        plan: true,
        active: true,
        createdAt: true,
        _count: {
          select: {
            users: true,
            products: true,
            sales: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(tenants);
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao listar comércios' });
  }
});

// Ativar / Desativar comércio
router.patch('/tenants/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { active } = z.object({ active: z.boolean() }).parse(req.body);

    const updated = await prisma.tenant.update({
      where: { id },
      data: { active }
    });

    res.json({ message: `Comércio ${active ? 'ativado' : 'desativado'} com sucesso`, tenant: updated });
  } catch (error: any) {
    res.status(400).json({ error: 'Erro ao atualizar status do comércio' });
  }
});

export default router;
