import { SignedXml } from 'xml-crypto';

const canonicalization = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';

export function signNfceXml({ xml, pemKey, pemCert, accessKey }: {
  xml: string;
  pemKey: string;
  pemCert: string;
  accessKey: string;
}): string {
  const signer = new SignedXml({
    privateKey: pemKey,
    publicCert: pemCert,
    signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
    canonicalizationAlgorithm: canonicalization,
    getKeyInfoContent: SignedXml.getKeyInfoContent,
  });
  signer.addReference({
    xpath: `//*[@Id='NFe${accessKey}']`,
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', canonicalization],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
  });
  signer.computeSignature(xml, {
    location: { reference: "/*[local-name()='NFe']", action: 'append' },
  });
  return signer.getSignedXml();
}
