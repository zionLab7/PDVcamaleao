import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import { authMiddleware } from '../middleware/auth';
import { parseAndValidateCertificate } from '../services/fiscal/certificate';
import { emitNfceForSale } from '../services/fiscal/nfceService';

const router = Router();
router.use(authMiddleware);

// Upload e Validação de Certificado Digital A1
const certificateSchema = z.object({
  pfxBase64: z.string().min(10, 'Arquivo de certificado inválido'),
  password: z.string().optional().default(''),
});

router.post('/certificate', async (req, res) => {
  try {
    const { pfxBase64, password } = certificateSchema.parse(req.body);

    const certInfo = parseAndValidateCertificate(pfxBase64, password);

    // Salvar no StoreSetting do tenant
    await prisma.storeSetting.upsert({
      where: { tenantId: req.tenantId! },
      update: {
        certificateA1: pfxBase64,
        certificatePassword: password,
        certificateOwner: certInfo.ownerName,
        certificateExpiresAt: certInfo.expiresAt,
        enableNfce: true,
      },
      create: {
        tenantId: req.tenantId!,
        certificateA1: pfxBase64,
        certificatePassword: password,
        certificateOwner: certInfo.ownerName,
        certificateExpiresAt: certInfo.expiresAt,
        enableNfce: true,
      },
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
});

router.post('/emit/:saleId', async (req, res) => {
  try {
    const { saleId } = req.params;
    const { customerCpf } = emitSchema.parse(req.body);

    const result = await emitNfceForSale({
      saleId,
      tenantId: req.tenantId!,
      customerCpf,
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(422).json(result);
    }
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Erro ao emitir NFC-e' });
  }
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

    res.json({
      sale,
      store: setting,
      isFiscal: sale.fiscalStatus === 'authorized',
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
