import { prisma } from '../../prisma';
import { parseAndValidateCertificate } from './certificate';
import { generateNfceAccessKey, generateNfceQrCodeUrl } from './qrCode';
import { buildNfceXml } from './xmlBuilder';
import { signNfceXml } from './xmlSigner';
import { sendNfceToSefazSp } from './sefazSp';
import { NfceEmissionResult, NfceItem, NfcePayment } from './types';

function mapPaymentMethod(method: string): string {
  const lower = method.toLowerCase();
  if (lower.includes('dinheiro')) return '01';
  if (lower.includes('cheque')) return '02';
  if (lower.includes('credito') || lower.includes('crédito')) return '03';
  if (lower.includes('debito') || lower.includes('débito')) return '04';
  if (lower.includes('pix')) return '17';
  if (lower.includes('vale') || lower.includes('alimentacao') || lower.includes('refeicao')) return '10';
  return '99';
}

export async function emitNfceForSale({
  saleId,
  tenantId,
  customerCpf,
}: {
  saleId: string;
  tenantId: string;
  customerCpf?: string;
}): Promise<NfceEmissionResult> {
  // 1. Buscar a venda e seus itens/pagamentos
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, tenantId },
    include: {
      items: {
        include: {
          product: true,
        },
      },
      payments: true,
    },
  });

  if (!sale) {
    throw new Error('Venda não encontrada.');
  }

  if (sale.fiscalStatus === 'authorized') {
    return {
      success: true,
      fiscalStatus: 'authorized',
      accessKey: sale.nfceAccessKey || undefined,
      protocol: sale.nfceProtocol || undefined,
      number: sale.nfceNumber || undefined,
      series: sale.nfceSeries || undefined,
      qrCodeUrl: sale.nfceQrCodeUrl || undefined,
    };
  }

  // 2. Buscar configurações fiscais da loja
  const setting = await prisma.storeSetting.findUnique({
    where: { tenantId },
  });

  if (!setting) {
    throw new Error('Configurações da loja não encontradas.');
  }

  if (!setting.certificateA1) {
    throw new Error('Certificado Digital A1 (.pfx) não configurado. Acesse Configurações > Dados Fiscais.');
  }

  // 3. Validar e ler certificado
  const certInfo = parseAndValidateCertificate(
    setting.certificateA1,
    setting.certificatePassword || ''
  );

  const cleanCnpj = (setting.document || certInfo.cnpj || '').replace(/\D/g, '');
  if (!cleanCnpj || cleanCnpj.length !== 14) {
    throw new Error('CNPJ da loja não informado ou inválido nas Configurações.');
  }

  const series = setting.nfceSeries || 1;
  const number = (setting.lastNfceNumber || 0) + 1;
  const environment = (setting.fiscalEnvironment as 'homologacao' | 'producao') || 'homologacao';

  // 4. Mapear itens da venda com dados fiscais
  const nfceItems: NfceItem[] = sale.items.map((item, index) => ({
    number: index + 1,
    productId: item.productId,
    name: item.productName,
    ncm: item.product?.ncm || '22021000',
    cfop: item.product?.cfop || '5102',
    unit: item.product?.unit || 'UN',
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.total,
    discount: item.discount,
    origin: item.product?.origin || '0',
    csosn: item.product?.csosn || '102',
  }));

  // 5. Mapear pagamentos
  const nfcePayments: NfcePayment[] = sale.payments.length > 0
    ? sale.payments.map((p) => ({
        methodCode: mapPaymentMethod(p.method),
        amount: p.amount,
      }))
    : [{ methodCode: '01', amount: sale.total }];

  // 6. Gerar Chave de Acesso oficial da NFC-e
  const { accessKey, cNF, cDV } = generateNfceAccessKey({
    cUF: '35', // SP
    cnpj: cleanCnpj,
    series,
    number,
  });

  // 7. Montar o XML v4.00
  const unsignedXml = buildNfceXml({
    accessKey,
    cNF,
    cDV,
    series,
    number,
    environment,
    storeName: setting.storeName || 'Comercio',
    storeCnpj: cleanCnpj,
    storeIe: setting.stateRegistration || 'ISENTO',
    storeAddress: setting.address || 'Rua do Comercio, 100',
    storeCity: setting.city || 'Sao Paulo',
    storeUf: setting.stateUf || 'SP',
    customerCpf: customerCpf || sale.customerCpf || undefined,
    items: nfceItems,
    payments: nfcePayments,
    subtotal: sale.subtotal,
    discount: sale.discount,
    total: sale.total,
    change: sale.change,
  });

  // 8. Assinar o XML com a chave privada do certificado A1
  const { signedXml, digestValue } = signNfceXml({
    xml: unsignedXml,
    pemKey: certInfo.pemKey,
    pemCert: certInfo.pemCert,
    accessKey,
  });

  // 9. Gerar o link oficial do QR Code da SEFAZ-SP
  const qrCodeUrl = generateNfceQrCodeUrl({
    accessKey,
    environment,
    cUF: '35',
    total: sale.total,
    digestValue,
    cscId: setting.cscId || '000001',
    cscToken: setting.cscToken || 'TOKENPADRAOTESTE',
  });

  // 10. Enviar para a SEFAZ-SP via mTLS
  const sefazResult = await sendNfceToSefazSp({
    signedXml,
    pfxBase64: setting.certificateA1,
    certificatePassword: setting.certificatePassword || '',
    environment,
  });

  if (sefazResult.success) {
    // Atualizar venda com status autorizado
    await prisma.sale.update({
      where: { id: saleId },
      data: {
        fiscalStatus: 'authorized',
        nfceNumber: number,
        nfceSeries: series,
        nfceAccessKey: accessKey,
        nfceProtocol: sefazResult.protocol,
        nfceXml: signedXml,
        nfceQrCodeUrl: qrCodeUrl,
        nfceError: null,
        nfceIssuedAt: new Date(),
        customerCpf: customerCpf || sale.customerCpf,
      },
    });

    // Incrementar número da última NFC-e emitida
    await prisma.storeSetting.update({
      where: { tenantId },
      data: {
        lastNfceNumber: number,
      },
    });

    return {
      success: true,
      fiscalStatus: 'authorized',
      accessKey,
      protocol: sefazResult.protocol,
      number,
      series,
      qrCodeUrl,
      xml: signedXml,
    };
  } else {
    // Atualizar venda com rejeição
    await prisma.sale.update({
      where: { id: saleId },
      data: {
        fiscalStatus: 'rejected',
        nfceError: `[cStat ${sefazResult.cStat}] ${sefazResult.xMotivo}`,
      },
    });

    return {
      success: false,
      fiscalStatus: 'rejected',
      cStat: sefazResult.cStat,
      xMotivo: sefazResult.xMotivo,
      errorMessage: `Rejeição SEFAZ [${sefazResult.cStat}]: ${sefazResult.xMotivo}`,
    };
  }
}
