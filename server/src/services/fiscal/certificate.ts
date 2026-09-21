import forge from 'node-forge';
import { FiscalCertificateInfo } from './types';

export function parseAndValidateCertificate(pfxBase64: string, password: string): FiscalCertificateInfo {
  try {
    const cleanBase64 = pfxBase64.replace(/^data:.*?;base64,/, '').trim();
    const p12Der = forge.util.decode64(cleanBase64);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

    // Encontra o saco do certificado e a chave privada
    let certBag: any = null;
    let keyBag: any = null;

    for (const bagType in forge.pki.oids) {
      // iterate bags
    }

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const pkcs8Bags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBags = p12.getBags({ bagType: forge.pki.oids.keyBag });

    const certBagList = certBags[forge.pki.oids.certBag];
    if (certBagList && certBagList.length > 0) {
      certBag = certBagList[0];
    }

    const allKeyBags = (pkcs8Bags[forge.pki.oids.pkcs8ShroudedKeyBag] || []).concat(
      keyBags[forge.pki.oids.keyBag] || []
    );

    if (allKeyBags.length > 0) {
      keyBag = allKeyBags[0];
    }

    if (!certBag || !certBag.cert) {
      throw new Error('Certificado X.509 não encontrado dentro do arquivo PFX/P12.');
    }

    const cert = certBag.cert;
    const expiresAt = cert.validity.notAfter;
    const now = new Date();
    const daysRemaining = Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysRemaining < 0) {
      throw new Error(`O certificado digital expirou em ${expiresAt.toLocaleDateString('pt-BR')}.`);
    }

    // Extrair titular e CNPJ/CPF dos atributos do sujeito
    let ownerName = 'Titular Desconhecido';
    let cnpj: string | undefined;
    let cpf: string | undefined;

    for (const attr of cert.subject.attributes) {
      if (attr.shortName === 'CN' || attr.name === 'commonName') {
        ownerName = attr.value as string;
        // Padrão ICP-Brasil: "EMPRESA LTDA:12345678000190" ou "NOME:12345678901"
        const parts = ownerName.split(':');
        if (parts.length > 1) {
          const doc = parts[parts.length - 1].replace(/\D/g, '');
          if (doc.length === 14) cnpj = doc;
          else if (doc.length === 11) cpf = doc;
        }
      }
    }

    const pemCert = forge.pki.certificateToPem(cert);
    let pemKey = '';
    if (keyBag && keyBag.key) {
      pemKey = forge.pki.privateKeyToPem(keyBag.key);
    }

    return {
      valid: true,
      ownerName,
      cnpj,
      cpf,
      expiresAt,
      daysRemaining,
      pemCert,
      pemKey,
    };
  } catch (error: any) {
    if (error.message && error.message.includes('PKCS#12')) {
      throw new Error('Senha do certificado digital incorreta ou arquivo PFX inválido.');
    }
    throw new Error(error.message || 'Erro ao ler certificado digital A1.');
  }
}
