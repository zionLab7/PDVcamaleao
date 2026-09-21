import crypto from 'crypto';

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
  const year = date.getFullYear().toString().slice(2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const aamm = `${year}${month}`;

  const formattedSeries = series.toString().padStart(3, '0');
  const formattedNumber = number.toString().padStart(9, '0');
  const randomCnf = cNF || Math.floor(10000000 + Math.random() * 90000000).toString();

  const keyWithoutDv = `${cUF}${aamm}${cleanCnpj}${model}${formattedSeries}${formattedNumber}${tpEmis}${randomCnf}`;
  const cDV = calculateModulo11(keyWithoutDv);
  const accessKey = `${keyWithoutDv}${cDV}`;

  return { accessKey, cNF: randomCnf, cDV };
}

/**
 * Gera o link oficial do QR Code da NFC-e (Padrão Nacional v2.0)
 */
export function generateNfceQrCodeUrl({
  accessKey,
  environment, // 'homologacao' | 'producao'
  cUF = '35',  // SP
  date = new Date(),
  total,
  digestValue,
  cscId,
  cscToken,
}: {
  accessKey: string;
  environment: 'homologacao' | 'producao';
  cUF?: string;
  date?: Date;
  total: number;
  digestValue: string;
  cscId: string;
  cscToken: string;
}): string {
  const baseUrl = environment === 'producao'
    ? 'https://nfce.fazenda.sp.gov.br/qrcode'
    : 'https://homologacao.nfce.fazenda.sp.gov.br/qrcode';

  const tpAmb = environment === 'producao' ? '1' : '2';
  const formattedTotal = total.toFixed(2);
  const hexDigest = Buffer.from(digestValue, 'base64').toString('hex');
  const cleanCscId = cscId.padStart(6, '0');

  // Parâmetros para o hash: chNFe|2|tpAmb|idCSC|cHashQRCode
  const hashString = `${accessKey}|2|${tpAmb}|${cleanCscId}${cscToken}`;
  const cHashQRCode = crypto.createHash('sha1').update(hashString).digest('hex').toUpperCase();

  return `${baseUrl}?p=${accessKey}|2|${tpAmb}|${cleanCscId}|${cHashQRCode}`;
}
