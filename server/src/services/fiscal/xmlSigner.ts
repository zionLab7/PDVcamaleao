import crypto from 'crypto';

/**
 * Assina digitalmente o XML da NFC-e no padrão W3C XMLDSig exigido pela SEFAZ
 */
export function signNfceXml({
  xml,
  pemKey,
  pemCert,
  accessKey,
}: {
  xml: string;
  pemKey: string;
  pemCert: string;
  accessKey: string;
}): { signedXml: string; digestValue: string } {
  // 1. Extrair a tag <infNFe Id="NFe...">...</infNFe>
  const infNFeMatch = xml.match(/<infNFe[^>]*>[\s\S]*?<\/infNFe>/);
  if (!infNFeMatch) {
    throw new Error('Tag <infNFe> não encontrada no XML para assinatura.');
  }

  const infNFeXml = infNFeMatch[0];

  // 2. Calcular o DigestValue (SHA-1 em Base64) do conteúdo de <infNFe>
  const digestValue = crypto
    .createHash('sha1')
    .update(infNFeXml, 'utf8')
    .digest('base64');

  // 3. Montar o bloco <SignedInfo> com Canonicalização C14N
  const signedInfo = `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod><Reference URI="#NFe${accessKey}"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform><Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></Transform></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod><DigestValue>${digestValue}</DigestValue></Reference></SignedInfo>`;

  // 4. Assinar o <SignedInfo> usando RSA-SHA1 com a chave privada PEM
  const signer = crypto.createSign('RSA-SHA1');
  signer.update(signedInfo, 'utf8');
  const signatureValue = signer.sign(pemKey, 'base64');

  // 5. Limpar o certificado X.509 em formato Base64 limpo (sem cabeçalhos PEM)
  const cleanCert = pemCert
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\r?\n|\r/g, '')
    .trim();

  // 6. Montar a tag <Signature>
  const signatureXml = `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">${signedInfo}<SignatureValue>${signatureValue}</SignatureValue><KeyInfo><X509Data><X509Certificate>${cleanCert}</X509Certificate></X509Data></KeyInfo></Signature>`;

  // 7. Inserir a assinatura antes do fechamento de </NFe>
  const signedXml = xml.replace('</NFe>', `${signatureXml}</NFe>`);

  return { signedXml, digestValue };
}
