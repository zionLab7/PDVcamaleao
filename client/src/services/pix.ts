import QRCode from 'qrcode';

// Standard CCITT 0xFFFF CRC16 calculation for EMVCo / Banco Central BR Code
function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function emvField(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

export function generatePixPayload(params: {
  pixKey: string;
  merchantName: string;
  merchantCity: string;
  amount: number;
  txId?: string;
}): string {
  const { pixKey, merchantName, merchantCity, amount, txId = '***' } = params;

  // Clean strings
  const cleanKey = pixKey.trim();
  const cleanName = (merchantName || 'Comercio Local')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .slice(0, 25)
    .trim();
  const cleanCity = (merchantCity || 'BRASIL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .slice(0, 15)
    .trim()
    .toUpperCase();
  const cleanTxId = (txId || '***').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || '***';
  const formattedAmount = amount.toFixed(2);

  // Subfields for ID 26 (Merchant Account Info)
  const gui = emvField('00', 'br.gov.bcb.pix');
  const keyField = emvField('01', cleanKey);
  const merchantAccountInfo = emvField('26', `${gui}${keyField}`);

  // Subfields for ID 62 (Additional Data)
  const txIdField = emvField('05', cleanTxId);
  const additionalData = emvField('62', txIdField);

  // Assemble full payload without CRC
  let payload = '';
  payload += emvField('00', '01'); // Format Indicator
  payload += emvField('01', '12'); // Point of Initiation
  payload += merchantAccountInfo; // Pix key info
  payload += emvField('52', '0000'); // Merchant Category
  payload += emvField('53', '986'); // BRL Currency
  if (amount > 0) {
    payload += emvField('54', formattedAmount); // Amount
  }
  payload += emvField('58', 'BR'); // Country Code
  payload += emvField('59', cleanName); // Merchant Name
  payload += emvField('60', cleanCity); // Merchant City
  payload += additionalData; // TxId / Ref
  payload += '6304'; // CRC16 Header

  // Calculate CRC16
  const checksum = crc16(payload);
  return `${payload}${checksum}`;
}

export async function generatePixQrCodeDataUrl(payload: string): Promise<string> {
  try {
    return await QRCode.toDataURL(payload, {
      width: 280,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
  } catch (err) {
    console.error('Erro ao gerar QRCode PIX:', err);
    return '';
  }
}
