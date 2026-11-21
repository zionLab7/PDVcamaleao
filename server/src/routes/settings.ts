import { Router } from 'express';
import { StoreSetting } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../prisma';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

const settingsSchema = z.object({
  storeName: z.string().min(1),
  tradeName: z.string().optional().nullable(),
  document: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  pixKey: z.string().optional().nullable(),
  pixReceiver: z.string().optional().nullable(),
  pixCity: z.string().optional().nullable(),
  receiptWidth: z.enum(['58mm', '80mm']).optional().default('80mm'),
  receiptFooter: z.string().optional().nullable(),
  enableSound: z.boolean().optional().default(true),
  
  // Fiscal / NFC-e
  enableNfce: z.boolean().optional().default(false),
  fiscalEnvironment: z.enum(['homologacao', 'producao']).optional().default('homologacao'),
  stateUf: z.string().optional().default('SP'),
  stateRegistration: z.string().optional().nullable(),
  taxRegime: z.string().optional().default('1'),
  nfceSeries: z.number().int().min(1).max(899).optional().default(1),
  nfceInitialNumber: z.number().int().min(1).max(999999999).optional(),
  fiscalLegalName: z.string().max(60).optional().nullable(),
  fiscalStreet: z.string().max(60).optional().nullable(),
  fiscalStreetNumber: z.string().max(60).optional().nullable(),
  fiscalDistrict: z.string().max(60).optional().nullable(),
  fiscalCityCode: z.string().max(7).optional().nullable(),
  fiscalPostalCode: z.string().max(9).optional().nullable(),
  fiscalTaxSource: z.string().max(120).optional().nullable(),
});

export function publicStoreSettings({ certificateA1, certificatePassword, cscToken, ...settings }: StoreSetting) {
  return settings;
}

// Get settings
router.get('/', async (req, res) => {
  try {
    let settings = await prisma.storeSetting.findUnique({
      where: { tenantId: req.tenantId! },
    });

    if (!settings) {
      const tenant = await prisma.tenant.findUnique({ where: { id: req.tenantId! } });
      settings = await prisma.storeSetting.create({
        data: {
          tenantId: req.tenantId!,
          storeName: tenant?.name || 'PDV Camaleão',
        },
      });
    }

    res.json(publicStoreSettings(settings));
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar configurações' });
  }
});

// Update settings
router.put('/', async (req, res) => {
  if (!['admin', 'manager'].includes(req.user?.role || '')) {
    return res.status(403).json({ error: 'Somente administradores e gerentes podem alterar as configurações.' });
  }
  try {
    const data = settingsSchema.parse(req.body);

    const settings = await prisma.storeSetting.upsert({
      where: { tenantId: req.tenantId! },
      update: data,
      create: {
        ...data,
        tenantId: req.tenantId!,
      },
    });

    res.json(publicStoreSettings(settings));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Dados inválidos', details: error.errors });
    }
    res.status(500).json({ error: 'Erro ao atualizar configurações' });
  }
});

export default router;
