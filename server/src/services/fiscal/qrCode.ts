import { randomInt } from 'crypto';
import { FiscalEnvironment } from './types';

/**
 * Calcula o Dígito Verificador (cDV) da Chave de Acesso usando Módulo 11 (pesos de 2 a 9)
 */
export function calculateModulo11(keyWithoutDv: string): number {
  let sum = 0;
  let weight = 2;

  for (let i = keyWithoutDv.length - 1; i >= 0; i--) {
    sum += parseInt(keyWithoutDv[i], 10) * weight;
    weight++;
    if (weight > 9) weight = 2;
  }

  const remainder = sum % 11;
  const dv = 11 - remainder;
  if (dv === 0 || dv === 10 || dv === 11) {
    return 0;
  }
  return dv;
}

/**
 * Gera a Chave de Acesso oficial da NFC-e de 44 dígitos
 */
export function generateNfceAccessKey({
  cUF = '35', // SP
  date = new Date(),
  cnpj,
  model = '65', // NFC-e
  series,
  number,
  tpEmis = '1', // 1 - Normal
  cNF,
}: {
  cUF?: string;
  date?: Date;
  cnpj: string;
  model?: string;
  series: number;
  number: number;
  tpEmis?: string;
  cNF?: string;
}): { accessKey: string; cNF: string; cDV: number } {
  const cleanCnpj = cnpj.replace(/\D/g, '').padStart(14, '0');
  const localDate = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  const year = localDate.getUTCFullYear().toString().slice(2);
  const month = (localDate.getUTCMonth() + 1).toString().padStart(2, '0');
  const aamm = `${year}${month}`;

  const formattedSeries = series.toString().padStart(3, '0');
  const formattedNumber = number.toString().padStart(9, '0');
  const randomCnf = cNF || randomInt(10000000, 100000000).toString();

  const keyWithoutDv = `${cUF}${aamm}${cleanCnpj}${model}${formattedSeries}${formattedNumber}${tpEmis}${randomCnf}`;
  const cDV = calculateModulo11(keyWithoutDv);
  const accessKey = `${keyWithoutDv}${cDV}`;

  return { accessKey, cNF: randomCnf, cDV };
}

export function publicConsultationUrl(environment: FiscalEnvironment): string {
  const host = environment === 'producao'
    ? 'www.nfce.fazenda.sp.gov.br'
    : 'www.homologacao.nfce.fazenda.sp.gov.br';
  return `https://${host}/NFCeConsultaPublica`;
}

export function generateNfceQrCodeUrl(accessKey: string, environment: FiscalEnvironment): string {
  const baseUrl = new URL('/qrcode', publicConsultationUrl(environment));
  return `${baseUrl.href}?p=${accessKey}|3|${environment === 'producao' ? '1' : '2'}`;
}
