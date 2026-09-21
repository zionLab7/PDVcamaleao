export interface FiscalCertificateInfo {
  valid: boolean;
  ownerName: string;
  cnpj?: string;
  cpf?: string;
  expiresAt: Date;
  daysRemaining: number;
  pemCert: string;
  pemKey: string;
}

export interface EmitNfceParams {
  saleId: string;
  tenantId: string;
  customerCpf?: string;
}

export interface NfceItem {
  number: number;
  productId: string;
  name: string;
  ncm: string;
  cfop: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  discount: number;
  origin: string;
  csosn: string;
}

export interface NfcePayment {
  methodCode: string; // 01-Dinheiro, 02-Cheque, 03-Cartao Credito, 04-Cartao Debito, 17-PIX, 99-Outros
  amount: number;
}

export interface NfceEmissionResult {
  success: boolean;
  fiscalStatus: 'authorized' | 'rejected' | 'pending';
  accessKey?: string;
  protocol?: string;
  number?: number;
  series?: number;
  qrCodeUrl?: string;
  xml?: string;
  errorMessage?: string;
  cStat?: number;
  xMotivo?: string;
}
