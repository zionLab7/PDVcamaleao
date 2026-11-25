import { createHash, randomBytes, randomUUID } from 'crypto';
import { Router } from 'express';
import forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { DOMParser } from '@xmldom/xmldom';
import { z } from 'zod';
import { prisma } from '../prisma';
import { authMiddleware } from '../middleware/auth';
import { parseSefazResult } from '../services/fiscal/sefazSp';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const namespace = 'http://www.w3.org/2000/09/xmldsig#';
const leaseDuration = 5 * 60 * 1000;
const router = Router();

router.post('/pair', authMiddleware, async (req, res) => {
  if (!['admin', 'manager'].includes(req.user?.role || '')) return res.sendStatus(403);
  const token = randomBytes(32).toString('hex');
  const result = await prisma.storeSetting.updateMany({
    where: { tenantId: req.tenantId! },
    data: { fiscalA3TokenHash: hash(token), fiscalA3LastSeen: null },
  }).catch(() => null);
  if (!result?.count) return res.status(400).json({ error: 'Salve os dados do estabelecimento antes de vincular.' });
  res.set('Cache-Control', 'no-store').json({ token });
});

router.use(async (req, res, next) => {
  try {
    const token = req.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!token) return res.sendStatus(401);
    const station = await prisma.storeSetting.findUnique({
      where: { fiscalA3TokenHash: hash(token) },
      select: { tenantId: true, document: true, tenant: { select: { active: true } } },
    });
    if (!station?.tenant.active) return res.sendStatus(401);
    res.locals.station = { tenantId: station.tenantId, cnpj: station.document?.replace(/\D/g, '') };
    res.set('Cache-Control', 'no-store');
    next();
  } catch (error) { next(error); }
});

router.post('/next', async (_req, res, next) => {
  try {
    const { tenantId, cnpj } = res.locals.station;
    if (!/^\d{14}$/.test(cnpj || '')) return res.sendStatus(409);
    const now = new Date();
    await prisma.storeSetting.updateMany({
      where: { tenantId, OR: [{ fiscalA3LastSeen: null }, { fiscalA3LastSeen: { lt: new Date(now.getTime() - 30_000) } }] },
      data: { fiscalA3LastSeen: now },
    });
    const where = {
      tenantId, queued: true, leaseUntil: { lte: now },
      sale: { fiscalStatus: 'pending', nfceAccessKey: { contains: cnpj } },
    };
    const job = await prisma.fiscalA3Job.findFirst({
      where, orderBy: { createdAt: 'asc' },
      include: { sale: { select: { nfceAccessKey: true, nfceEnvironment: true, nfcePendingXml: true, sequenceNumber: true } } },
    });
    if (!job) return res.status(204).end();
    if (job.sale.nfceAccessKey?.slice(6, 20) !== cnpj) return res.sendStatus(409);
    const leaseId = randomUUID();
    const claim = await prisma.fiscalA3Job.updateMany({
      where: { ...where, saleId: job.saleId },
      data: { leaseId, leaseUntil: new Date(now.getTime() + leaseDuration) },
    });
    if (!claim.count) return res.status(204).end();
    return res.json({
      saleId: job.saleId, leaseId, accessKey: job.sale.nfceAccessKey, environment: job.sale.nfceEnvironment,
      sequenceNumber: job.sale.sequenceNumber, unsignedXml: job.unsignedXml, signedXml: job.sale.nfcePendingXml,
    });
  } catch (error) { next(error); }
});

export function verifyStationSignature(unsignedXml: string, signedXml: string, accessKey: string) {
  const prefix = unsignedXml.slice(0, -'</NFe>'.length);
  if (!signedXml.startsWith(prefix) || !signedXml.endsWith('</NFe>')) return false;
  const signatureXml = signedXml.slice(prefix.length, -'</NFe>'.length);
  const signature = new DOMParser().parseFromString(signatureXml, 'application/xml').documentElement;
  if (!signature || signature.localName !== 'Signature' || signature.namespaceURI !== namespace) return false;
  const references = signature.getElementsByTagNameNS(namespace, 'Reference');
  if (references.length !== 1 || references.item(0)?.getAttribute('URI') !== `#NFe${accessKey}`) return false;
  const certificates = signature.getElementsByTagNameNS(namespace, 'X509Certificate');
  const certificate = certificates.item(0)?.textContent?.replace(/\s/g, '');
  if (certificates.length !== 1 || !certificate || !/^[A-Za-z0-9+/]+=*$/.test(certificate)) return false;
  const pem = `-----BEGIN CERTIFICATE-----\n${certificate.match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----`;
  const leaf = forge.pki.certificateFromPem(pem);
  const now = new Date();
  if (now < leaf.validity.notBefore || now > leaf.validity.notAfter) return false;
  const { asn1 } = forge;
  const altNames = (leaf.getExtension('subjectAltName') as { altNames?: { type: number; value: forge.asn1.Asn1[] }[] } | null)?.altNames;
  const cnpj = altNames?.find(name => {
    const oid = Array.isArray(name.value) && name.value[0]?.value;
    return name.type === 0 && typeof oid === 'string' && asn1.derToOid(oid) === '2.16.76.1.3.3';
  })?.value[1]?.value;
  if (!Array.isArray(cnpj) || typeof cnpj[0]?.value !== 'string'
    || !/^\d{14}$/.test(cnpj[0].value) || cnpj[0].value.slice(0, 8) !== accessKey.slice(6, 14)) return false;
  const verifier = new SignedXml({ publicCert: pem,
    getCertFromKeyInfo: () => null });
  verifier.loadSignature(signatureXml);
  return verifier.checkSignature(signedXml);
}

const message = z.discriminatedUnion('step', [
  z.object({ step: z.literal('signed'), leaseId: z.string().uuid(), xml: z.string().min(1).max(500_000) }),
  z.object({ step: z.literal('result'), leaseId: z.string().uuid(), xml: z.string().min(1).max(1_500_000),
    operation: z.enum(['authorization', 'query']) }),
  z.object({ step: z.literal('error'), leaseId: z.string().uuid(), message: z.string().trim().min(1).max(300) }),
]);

router.post('/jobs/:saleId', async (req, res, next) => {
  try {
    const body = message.safeParse(req.body);
    if (!body.success) return res.sendStatus(400);
    const input = body.data;
    const { tenantId, cnpj } = res.locals.station;
    const saleId = req.params.saleId;
    const recorded = await prisma.$transaction(async tx => {
      const scope = { saleId, tenantId, leaseId: input.leaseId, queued: true, leaseUntil: { gt: new Date() } };
      // Acquire the job row before reading or changing its sale.
      const locked = await tx.fiscalA3Job.updateMany({
        where: scope, data: { leaseUntil: new Date(Date.now() + leaseDuration) },
      });
      if (!locked.count) return false;
      const job = await tx.fiscalA3Job.findUniqueOrThrow({ where: { saleId }, include: { sale: true } });
      const sale = job.sale;
      if (sale.fiscalStatus !== 'pending' || !sale.nfceAccessKey || sale.nfceAccessKey.slice(6, 20) !== cnpj
        || (sale.nfceEnvironment !== 'producao' && sale.nfceEnvironment !== 'homologacao')) {
        throw new Error('A emissão mudou ou está fora do escopo da estação.');
      }
      if (input.step === 'signed') {
        if (sale.nfcePendingXml === input.xml) return true;
        if (sale.nfcePendingXml || !verifyStationSignature(job.unsignedXml, input.xml, sale.nfceAccessKey)) {
          throw new Error('Assinatura inválida ou XML divergente.');
        }
        await tx.sale.update({ where: { id: saleId }, data: { nfcePendingXml: input.xml, nfceError: null } });
        return true;
      }
      if (input.step === 'error') {
        await tx.sale.update({ where: { id: saleId }, data: { nfceError: input.message } });
      } else {
        if (!sale.nfcePendingXml) throw new Error('XML assinado indisponível.');
        const result = parseSefazResult(input.xml, sale.nfceAccessKey, sale.nfceEnvironment, input.operation);
        if (result.success) {
          const signed = new DOMParser().parseFromString(sale.nfcePendingXml, 'application/xml');
          const digest = signed.getElementsByTagNameNS(namespace, 'DigestValue').item(0)?.textContent?.trim();
          if (!digest || result.digest !== digest) throw new Error('Protocolo divergente do XML assinado.');
        }
        await tx.sale.update({
          where: { id: saleId },
          data: result.success && result.protocolXml ? {
            fiscalStatus: 'authorized', nfceProtocol: result.protocol, nfceError: null, nfcePendingXml: null,
            nfceXml: `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">${sale.nfcePendingXml}${result.protocolXml}</nfeProc>`,
          } : {
            fiscalStatus: result.pending ? 'pending' : 'rejected',
            nfceError: `SEFAZ [${result.cStat}]: ${result.xMotivo}`,
          },
        });
      }
      await tx.fiscalA3Job.update({ where: { saleId }, data: { queued: false, leaseId: null } });
      return true;
    }).catch(() => false);
    if (!recorded) return res.status(409).json({ error: 'A estação não conseguiu registrar esta etapa fiscal.' });
    return res.status(204).end();
  } catch (error) { next(error); }
});

export default router;
