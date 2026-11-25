import { Router } from 'express';
import { nfeRecipientSchema } from '../services/fiscal/nfeRecipient';
import { z } from 'zod';
import { prisma } from '../prisma';
import { authMiddleware } from '../middleware/auth';
import { parseAndValidateCertificate } from '../services/fiscal/certificate';
import { emitNfceForSale } from '../services/fiscal/nfceService';

import { sealFiscalSecret } from '../services/fiscal/secrets';
import { publicStoreSettings } from './settings';

const router = Router();
router.use(authMiddleware);

// Upload e Validação de Certificado Digital A1
const certificateSchema = z.object({
  pfxBase64: z.string().min(10, 'Arquivo de certificado inválido'),
  password: z.string().optional().default(''),
});

router.post('/certificate', async (req, res) => {
  if (!['admin', 'manager'].includes(req.user?.role || '')) {
    return res.status(403).json({ error: 'Somente administradores e gerentes podem instalar o certificado.' });
  }
  try {
    const { pfxBase64, password } = certificateSchema.parse(req.body);

    const certInfo = parseAndValidateCertificate(pfxBase64, password);

    if (!certInfo.cnpj) throw new Error('Use um certificado digital A1 de pessoa jurídica com CNPJ.');
    const data = {
      certificateA1: sealFiscalSecret(pfxBase64),
      certificatePassword: sealFiscalSecret(password),
      certificateOwner: certInfo.ownerName,
      certificateExpiresAt: certInfo.expiresAt,
    };
    await prisma.storeSetting.upsert({
      where: { tenantId: req.tenantId! },
      update: data,
      create: { ...data, tenantId: req.tenantId! },
    });

    res.json({
      success: true,
      message: 'Certificado Digital A1 validado e salvo com sucesso!',
      owner: certInfo.ownerName,
      cnpj: certInfo.cnpj,
      cpf: certInfo.cpf,
      expiresAt: certInfo.expiresAt,
      daysRemaining: certInfo.daysRemaining,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Erro ao validar certificado digital' });
  }
});

// Emissão de NFC-e para uma venda
const emitSchema = z.object({
  customerCpf: z.string().optional(),
  recipient: nfeRecipientSchema.optional(),
});

router.post('/emit/:saleId', async (req, res) => {
  try {
    const { saleId } = req.params;
    const body = emitSchema.safeParse(req.body);
    if (!body.success) {
      const first = body.error.issues[0];
      return res.status(400).json({ error: `Confira ${first.path.join('.')}: ${first.message}` });
    }
    const { customerCpf, recipient } = body.data;

    const result = await emitNfceForSale({
      saleId,
      tenantId: req.tenantId!,
      customerCpf, recipient,
    });

    if (result.success || result.fiscalStatus === 'pending') {
      res.json(result);
    } else {
      res.status(422).json({ ...result, error: result.errorMessage });
    }
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Erro ao emitir NFC-e' });
  }
});

router.get('/status/:saleId', async (req, res) => {
  try {
    const sale = await prisma.sale.findFirst({
      where: { id: req.params.saleId, tenantId: req.tenantId! },
      select: { fiscalStatus: true, nfceError: true, nfceAccessKey: true, nfceEnvironment: true,
        nfceIssuedAt: true, nfceProtocol: true, nfceNumber: true, nfceSeries: true, nfceQrCodeUrl: true,
        nfceTaxEstimate: true, nfceTaxSource: true },
    });
    if (!sale) return res.status(404).json({ error: 'Venda não encontrada.' });
    res.json({
      success: sale.fiscalStatus === 'authorized' && !!sale.nfceEnvironment,
      fiscalStatus: sale.fiscalStatus, errorMessage: sale.nfceError, accessKey: sale.nfceAccessKey,
      environment: sale.nfceEnvironment, issuedAt: sale.nfceIssuedAt, protocol: sale.nfceProtocol,
      number: sale.nfceNumber, series: sale.nfceSeries, qrCodeUrl: sale.nfceQrCodeUrl,
      taxEstimate: sale.nfceTaxEstimate, taxSource: sale.nfceTaxSource,
    });
  } catch {
    res.status(500).json({ error: 'Erro ao consultar a emissão.' });
  }
});

router.get('/xml/:saleId', async (req, res) => {
  const sale = await prisma.sale.findFirst({
    where: { id: req.params.saleId, tenantId: req.tenantId!, fiscalStatus: 'authorized',
      nfceEnvironment: { not: null } },
    select: { nfceXml: true, nfceAccessKey: true },
  }).catch(() => undefined);
  if (sale === undefined) return res.status(500).json({ error: 'Erro ao buscar XML fiscal.' });
  if (!sale?.nfceXml) return res.status(404).json({ error: 'XML autorizado indisponível.' });
  res.json({ xml: sale.nfceXml, fileName: `${sale.nfceAccessKey}-procNFe.xml` });
});

// Obter dados fiscais da venda para impressão de DANFE NFC-e
router.get('/danfe/:saleId', async (req, res) => {
  try {
    const { saleId } = req.params;

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, tenantId: req.tenantId! },
      include: {
        items: true,
        payments: true,
      },
    });

    if (!sale) {
      return res.status(404).json({ error: 'Venda não encontrada' });
    }

    const setting = await prisma.storeSetting.findUnique({
      where: { tenantId: req.tenantId! },
    });

    const { nfcePendingXml, ...publicSale } = sale;
    res.json({
      sale: publicSale,
      store: setting && publicStoreSettings(setting),
      isFiscal: sale.fiscalStatus === 'authorized' && !!sale.nfceEnvironment,
      accessKey: sale.nfceAccessKey,
      protocol: sale.nfceProtocol,
      number: sale.nfceNumber,
      series: sale.nfceSeries,
      qrCodeUrl: sale.nfceQrCodeUrl,
      issuedAt: sale.nfceIssuedAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Erro ao buscar dados do DANFE' });
  }
});

export default router;
