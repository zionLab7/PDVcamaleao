import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

function key() {
  const value = process.env.FISCAL_ENCRYPTION_KEY || '';
  if (!/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error('Configure FISCAL_ENCRYPTION_KEY no servidor fiscal.');
  }
  return Buffer.from(value, 'hex');
}

export function sealFiscalSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['enc1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), ciphertext.toString('base64')].join(':');
}

export function openFiscalSecret(value: string): string {
  if (!value.startsWith('enc1:')) {
    throw new Error('Instale novamente o certificado A1 para ativar o armazenamento criptografado.');
  }
  const [, iv, tag, ciphertext] = value.split(':');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('O servidor não conseguiu abrir o certificado A1. Confira a chave fiscal.');
  }
}
