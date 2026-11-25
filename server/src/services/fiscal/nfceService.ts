import { NfeRecipient } from './nfeRecipient';
import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma';
import { parseAndValidateCertificate } from './certificate';
import { generateNfceAccessKey, generateNfceQrCodeUrl } from './qrCode';
import { buildNfceXml, contributionCodes } from './xmlBuilder';
import { signNfceXml } from './xmlSigner';
import { queryNfceAtSefazSp, sendNfceToSefazSp } from './sefazSp';
import { openFiscalSecret } from './secrets';
import { FiscalEnvironment, NfceEmissionResult, NfceItem } from './types';

const payments = new Map([
  ['dinheiro', '01'], ['credito', '03'], ['debito', '04'], ['pix', '20'], ['fiado', '99'],
]);
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100);
const digits = (value?: string | null) => (value || '').replace(/\D/g, '');

function requiredText(value: string | null, label: string, max: number, min = 1) {
  const text = value?.trim() || '';
  if (text.length < min || text.length > max || /[\x00-\x1f]/.test(text)) {
    throw new Error(`Confira o campo ${label} em Configurações > Dados Fiscais.`);
  }
  return text;
}

function isCst(value: string | null): value is typeof contributionCodes[number] {
  return contributionCodes.some(code => code === value);
}

function validGtin(gtin: string): boolean {
  if (!/^(?:\d{8}|\d{12,14})$/.test(gtin) || /^0+$/.test(gtin)) return false;
  const sum = [...gtin.slice(0, -1)].reverse().reduce((total, digit, index) =>
    total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - sum % 10) % 10 === Number(gtin.at(-1));
}

function validCpf(value: string): boolean {
  if (!/^\d{11}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
  return [9, 10].every(length => {
    const sum = [...value.slice(0, length)].reduce((total, digit, i) => total + Number(digit) * (length + 1 - i), 0);
    return (sum * 10 % 11) % 10 === Number(value[length]);
  });
}

export async function emitNfceForSale({ saleId, tenantId, customerCpf, recipient }: {
  saleId: string;
  tenantId: string;
  customerCpf?: string;
  recipient?: NfeRecipient;
}): Promise<NfceEmissionResult> {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, tenantId },
    include: { items: { include: { product: true }, orderBy: { id: 'asc' } }, payments: true },
  });
  if (!sale || sale.status !== 'completed') throw new Error('Venda concluída não encontrada.');
  if (sale.fiscalStatus === 'authorized') {
    if (!sale.nfceEnvironment) throw new Error('Emissão anterior à atualização. Confira a chave na SEFAZ antes de qualquer reemissão.');
    return {
      success: true, fiscalStatus: 'authorized', accessKey: sale.nfceAccessKey!,
      protocol: sale.nfceProtocol!, number: sale.nfceNumber!, series: sale.nfceSeries!,
      qrCodeUrl: sale.nfceQrCodeUrl!, environment: sale.nfceEnvironment as FiscalEnvironment,
      taxEstimate: sale.nfceTaxEstimate ?? undefined, taxSource: sale.nfceTaxSource ?? undefined,
      issuedAt: sale.nfceIssuedAt?.toISOString(),
    };
  }

  const setting = await prisma.storeSetting.findUnique({ where: { tenantId } });
  if (!setting) throw new Error('Configure os dados fiscais do estabelecimento.');
  const cnpj = digits(setting.document);
  const environment = (sale.nfceEnvironment && sale.fiscalStatus === 'pending'
    ? sale.nfceEnvironment : setting.fiscalEnvironment) as FiscalEnvironment;
  const savedJob = sale.fiscalStatus === 'pending'
    ? await prisma.fiscalA3Job.findUnique({ where: { saleId } }) : null;
  const model = sale.fiscalStatus === 'pending' ? sale.nfceAccessKey?.slice(20, 22) : recipient ? '55' : '65';
  const useA3 = !!savedJob || ((!sale.nfceAccessKey || sale.fiscalStatus !== 'pending') && setting.fiscalCertificateMode === 'A3');
  if (!setting.enableNfce && sale.fiscalStatus !== 'pending') throw new Error('Ative a emissão em Dados Fiscais.');
  if (model === '55' && !useA3) throw new Error('Selecione a estação A3 para emitir NF-e modelo 55.');
  if (!/^\d{14}$/.test(cnpj)) throw new Error('Confira o CNPJ do emitente.');
  if (useA3 && !setting.fiscalA3TokenHash) throw new Error('Vincule a estação Windows em Dados Fiscais.');
  if (!useA3 && !setting.certificateA1) throw new Error('Instale o certificado A1 em Dados Fiscais.');
  const pfxBase64 = useA3 ? '' : openFiscalSecret(setting.certificateA1!);
  const certificatePassword = useA3 ? '' : openFiscalSecret(setting.certificatePassword || '');
  const certificate = useA3 ? null : parseAndValidateCertificate(pfxBase64, certificatePassword);
  if (certificate && certificate.cnpj?.slice(0, 8) !== cnpj.slice(0, 8)) {
    throw new Error('O CNPJ da loja deve corresponder à empresa titular do certificado A1.');
  }
  const connection = { pfxBase64, certificatePassword, environment };
  const saved = sale.fiscalStatus === 'pending';
  let accessKey = sale.nfceAccessKey || '';
  let signedXml = sale.nfcePendingXml || '';
  let qrCodeUrl = sale.nfceQrCodeUrl || '';
  let number = sale.nfceNumber || 0;
  let series = sale.nfceSeries || 0;
  let date = sale.nfceIssuedAt || new Date();
  let taxEstimate = sale.nfceTaxEstimate ?? 0;
  let taxSource = sale.nfceTaxSource || '';

  if (saved) {
    if ((!signedXml && !savedJob) || !accessKey || accessKey.slice(6, 20) !== cnpj) {
      throw new Error('Emissão pendente. Confira a chave na SEFAZ e mantenha o CNPJ do emitente.');
    }
  } else {
    if (setting.stateUf !== 'SP' || setting.taxRegime !== '1') {
      throw new Error('A emissão direta disponível atende estabelecimentos de SP com CRT 1.');
    }
    if (environment === 'producao') {
      const verified = await prisma.sale.findMany({
        where: { tenantId, fiscalStatus: 'authorized', nfceEnvironment: 'homologacao',
          nfceAccessKey: { contains: cnpj } },
        select: { nfceAccessKey: true },
      });
      if (!verified.some(note => note.nfceAccessKey?.slice(6, 22) === cnpj + model)) throw new Error('Autorize uma nota de teste do mesmo modelo para este CNPJ antes de emitir em produção.');
    }
    const ie = digits(setting.stateRegistration);
    const postalCode = digits(setting.fiscalPostalCode);
    const cityCode = digits(setting.fiscalCityCode);
    if (!/^\d{12}$/.test(ie) || !/^\d{8}$/.test(postalCode) || !/^35\d{5}$/.test(cityCode)) {
      throw new Error('Confira a inscrição estadual, o CEP e o código IBGE do município paulista.');
    }
    const issuer = {
      cnpj, ie, postalCode, cityCode,
      name: requiredText(setting.fiscalLegalName, 'razão social', 60, 2),
      street: requiredText(setting.fiscalStreet, 'logradouro', 60, 2),
      number: requiredText(setting.fiscalStreetNumber, 'número', 60),
      district: requiredText(setting.fiscalDistrict, 'bairro', 60, 2),
      city: requiredText(setting.city, 'município', 60, 2),
      taxSource: requiredText(setting.fiscalTaxSource, 'fonte dos tributos aproximados', 120),
    };
    taxSource = issuer.taxSource;
    const cpf = recipient ? '' : digits(customerCpf || sale.customerCpf);
    if (!recipient && (customerCpf || sale.customerCpf) && !validCpf(cpf)) throw new Error('CPF do consumidor inválido.');
    const total = cents(sale.total);
    const change = cents(sale.change);
    if (total <= 0 || sale.items.length === 0 || sale.items.length > 990) {
      throw new Error('A venda precisa ter valor positivo e de 1 a 990 itens.');
    }

    const gross = sale.items.map(item => cents(item.quantity * item.unitPrice));
    const grossTotal = gross.reduce((sum, value) => sum + value, 0);
    const discount = grossTotal - total;
    if (discount < 0 || discount !== cents(sale.discount) + sale.items.reduce((sum, item) => sum + cents(item.discount), 0)) {
      throw new Error('Confira a diferença entre o valor dos itens, os descontos e o total da venda.');
    }
    const ownDiscount = sale.items.map(item => cents(item.discount));
    const globalDiscount = cents(sale.discount);
    const remainingTotal = grossTotal - ownDiscount.reduce((sum, value) => sum + value, 0);
    let runningBase = 0;
    let allocated = 0;
    const items: NfceItem[] = sale.items.map((item, i) => {
      const p = item.product;
      const { ncm, cfop, csosn, origin, pisCst, cofinsCst, taxEstimateRate } = p;
      const cest = digits(p.cest);
      const gtin = p.fiscalUseBarcode ? p.barcode?.trim() || '' : undefined;
      if (gtin !== undefined && !validGtin(gtin)) throw new Error(`GTIN fiscal inválido em “${item.productName}”.`);
      if (!/^\d{8}$/.test(ncm) || ncm === '00000000' || !/^5\d{3}$/.test(cfop)
        || (recipient && !['5101', '5102', '5405'].includes(cfop))
        || !['102', '103', '300', '400', '500'].includes(csosn) || !/^[0-8]$/.test(origin)
        || (cest ? !/^\d{7}$/.test(cest) : csosn === '500')
        || !isCst(pisCst) || !isCst(cofinsCst) || taxEstimateRate === null || taxEstimateRate < 0 || taxEstimateRate > 100) {
        throw new Error(`Confira os dados fiscais do produto “${item.productName}”.`);
      }
      if (item.quantity <= 0 || item.unitPrice <= 0 || ownDiscount[i] > gross[i]
        || Number(item.quantity.toFixed(4)) !== item.quantity) {
        throw new Error(`Quantidade, preço ou desconto inválido em “${item.productName}”.`);
      }
      runningBase += gross[i] - ownDiscount[i];
      const cumulative = Math.round(globalDiscount * runningBase / remainingTotal);
      const itemDiscount = ownDiscount[i] + cumulative - allocated;
      allocated = cumulative;
      return {
        number: i + 1, productId: p.id, name: item.productName, ncm, gtin, cfop, origin, csosn, cest,
        unit: p.unit, quantity: item.quantity, unitPrice: item.unitPrice, totalPrice: gross[i] / 100,
        discount: itemDiscount / 100, pisCst, cofinsCst,
        taxEstimate: Math.round((gross[i] - itemDiscount) * taxEstimateRate / 100) / 100,
      };
    });
    taxEstimate = cents(items.reduce((sum, item) => sum + item.taxEstimate, 0)) / 100;
    if (sale.payments.reduce((sum, p) => sum + cents(p.amount), 0) !== total) {
      throw new Error('O valor registrado nos pagamentos difere do total da venda.');
    }
    const cash = sale.payments.find(p => p.method === 'dinheiro');
    if (change < 0 || (change > 0 && !cash)) throw new Error('Troco sem pagamento em dinheiro.');
    const paymentDetails = sale.payments.map(p => {
      const methodCode = payments.get(p.method);
      if (!methodCode || p.amount <= 0) throw new Error(`Pagamento sem mapeamento fiscal: ${p.method}.`);
      return { methodCode, amount: (cents(p.amount) + (p.id === cash?.id ? change : 0)) / 100 };
    });

    series = recipient ? setting.nfeSeries : setting.nfceSeries;
    date = new Date();
    const sequenceKey = { cnpj, environment, series };
    try {
      await prisma.$transaction(async tx => {
        const sequenceArgs = {
          where: { cnpj_environment_series: sequenceKey },
          create: { ...sequenceKey, lastNumber: recipient ? setting.nfeInitialNumber : setting.nfceInitialNumber },
          update: { lastNumber: { increment: 1 } },
        };
        const sequence = recipient ? await tx.nfeSequence.upsert(sequenceArgs) : await tx.nfceSequence.upsert(sequenceArgs);
        number = sequence.lastNumber;
        if (number > 999999999) throw new Error('A numeração da série da NFC-e chegou ao limite.');
        const key = generateNfceAccessKey({ cnpj, series, number, date, model });
        accessKey = key.accessKey;
        qrCodeUrl = recipient ? '' : generateNfceQrCodeUrl(accessKey, environment);
        const xml = buildNfceXml({
          ...key, date, series, number, environment, issuer, customerCpf: cpf || undefined, recipient,
          items, payments: paymentDetails, total: total / 100, change: change / 100, qrCodeUrl,
        });
        if (Buffer.byteLength(xml) > 480_000) throw new Error('O XML ultrapassa o limite de tamanho para transmissão fiscal.');
        if (certificate) signedXml = signNfceXml({ xml, accessKey, pemKey: certificate.pemKey, pemCert: certificate.pemCert });
        const claimed = await tx.sale.updateMany({
          where: { id: saleId, tenantId, status: 'completed', fiscalStatus: sale.fiscalStatus, updatedAt: sale.updatedAt },
          data: {
            fiscalStatus: 'pending', nfceEnvironment: environment, nfceNumber: number, nfceSeries: series,
            nfceAccessKey: accessKey, nfcePendingXml: signedXml || null, nfceQrCodeUrl: qrCodeUrl,
            nfceIssuedAt: date, nfceError: null, nfceTaxEstimate: taxEstimate, nfceTaxSource: taxSource,
            customerCpf: recipient ? sale.customerCpf : cpf || null,
          },
        });
        if (!claimed.count) throw new Error('A venda mudou durante a emissão. Reabra o comprovante.');
        if (useA3) {
          await tx.fiscalA3Job.upsert({
            where: { saleId }, create: { saleId, tenantId, unsignedXml: xml },
            update: { unsignedXml: xml, queued: true, leaseId: null, leaseUntil: date },
          });
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new Error('Outra NFC-e está reservando um número nesta série. Tente novamente.');
      }
      throw error;
    }
  }

  if (useA3) {
    if (savedJob && !savedJob.queued) {
      await prisma.fiscalA3Job.updateMany({
        where: { saleId, tenantId, queued: false, sale: { fiscalStatus: 'pending', nfceAccessKey: accessKey } },
        data: { queued: true, leaseId: null, leaseUntil: new Date() },
      });
    }
    return { success: false, fiscalStatus: 'pending', accessKey,
      errorMessage: 'Solicitação na fila. Confirme a operação na estação Windows com o cartão A3.' };
  }

  const pending = { id: saleId, tenantId, nfceAccessKey: accessKey, fiscalStatus: 'pending' };
  let result;
  try {
    result = saved ? await queryNfceAtSefazSp(connection, accessKey) : await sendNfceToSefazSp(connection, signedXml, accessKey);
    if (saved && result.cStat === 217) result = await sendNfceToSefazSp(connection, signedXml, accessKey);
  } catch {
    const errorMessage = 'A SEFAZ não confirmou a emissão. Use o botão fiscal novamente para consultar a mesma chave.';
    await prisma.sale.updateMany({ where: pending, data: { nfceError: errorMessage } });
    return { success: false, fiscalStatus: 'pending', errorMessage, accessKey };
  }

  if (result.success && result.protocolXml) {
    const xml = `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">${signedXml}${result.protocolXml}</nfeProc>`;
    await prisma.sale.updateMany({
      where: pending,
      data: { fiscalStatus: 'authorized', nfceProtocol: result.protocol, nfceXml: xml, nfcePendingXml: null, nfceError: null },
    });
    return {
      success: true, fiscalStatus: 'authorized', accessKey, protocol: result.protocol, xml,
      number, series, qrCodeUrl, environment, taxEstimate, taxSource, issuedAt: date.toISOString(),
    };
  }

  const fiscalStatus = result.pending ? 'pending' : 'rejected';
  const errorMessage = `SEFAZ [${result.cStat}]: ${result.xMotivo}`;
  await prisma.sale.updateMany({
    where: pending, data: { fiscalStatus, nfceError: errorMessage },
  });
  return { success: false, fiscalStatus, cStat: result.cStat, xMotivo: result.xMotivo, errorMessage, accessKey };
}
