const assert = require('node:assert/strict');
const forge = require('node-forge');
const { test } = require('node:test');
const { SignedXml } = require('xml-crypto');
const { buildNfceXml } = require('../dist/services/fiscal/xmlBuilder');
const { signNfceXml } = require('../dist/services/fiscal/xmlSigner');
const { parseSefazResult } = require('../dist/services/fiscal/sefazSp');
const { generateNfceAccessKey, generateNfceQrCodeUrl } = require('../dist/services/fiscal/qrCode');

const ns = 'http://www.portalfiscal.inf.br/nfe';
const date = new Date('2026-12-01T01:00:00Z');
const issuer = {
  name: 'Mercado Exemplo LTDA', cnpj: '12345678000195', ie: '123456789110',
  street: 'Rua Exemplo', number: '77', district: 'Centro', postalCode: '01001000',
  city: 'São Paulo', cityCode: '3550308', taxSource: 'Tabela fiscal de teste',
};
const series = 1;
const number = 24;
const environment = 'homologacao';
const key = generateNfceAccessKey({ date, cnpj: issuer.cnpj, series, number, cNF: '12345678' });
const qrCodeUrl = generateNfceQrCodeUrl(key.accessKey, environment);

function signedExample() {
  const xml = buildNfceXml({
    ...key, series, number, date, environment, qrCodeUrl, issuer,
    items: [{
      number: 1, productId: 'sku-1', name: 'Produto A', unit: 'UN', ncm: '22021000',
      cest: '0300700', origin: '0', cfop: '5405', csosn: '500', pisCst: '49', cofinsCst: '49',
      quantity: 2, unitPrice: 10, totalPrice: 20, discount: 2, taxEstimate: 2.7,
    }],
    total: 18, change: 2, payments: [{ methodCode: '01', amount: 20 }],
  });
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = '01';
  certificate.validity.notBefore = new Date('2026-01-01');
  certificate.validity.notAfter = new Date('2027-01-01');
  certificate.setSubject([{ shortName: 'CN', value: 'Fixture NFC-e' }]);
  certificate.setIssuer(certificate.subject.attributes);
  certificate.sign(keys.privateKey, forge.md.sha256.create());
  const pemCert = forge.pki.certificateToPem(certificate);
  const signedXml = signNfceXml({
    xml, accessKey: key.accessKey, pemKey: forge.pki.privateKeyToPem(keys.privateKey), pemCert,
  });
  return { signedXml, publicKey: pemCert };
}

test('NFC-e uses the São Paulo month, real XML amounts and the online QR Code v3', () => {
  const { signedXml } = signedExample();
  assert.equal(key.accessKey.slice(2, 6), '2611');
  assert.match(signedXml, /2026-11-30T22:00:00-03:00/);
  assert.match(signedXml, /<ICMSSN500><orig>0<\/orig><CSOSN>500<\/CSOSN>/);
  assert.match(signedXml, /<vProd>20.00<\/vProd>/);
  assert.match(signedXml, /<vDesc>2.00<\/vDesc>/);
  assert.match(signedXml, /<vPag>20.00<\/vPag>.*<vTroco>2.00<\/vTroco>/);
  assert.match(signedXml, /NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO/);
  assert.equal(new URL(qrCodeUrl).searchParams.get('p'), `${key.accessKey}|3|2`);
  assert.ok(signedXml.indexOf('<infNFeSupl>') < signedXml.indexOf('<Signature '));
});

test('XML signature verifies using the signed infNFe and rejects modified totals', () => {
  const { signedXml, publicKey } = signedExample();
  function verify(xml) {
    const verifier = new SignedXml({ publicCert: publicKey, getCertFromKeyInfo: () => null });
    verifier.loadSignature(xml.match(/<Signature\b[^>]*>[\s\S]+?<\/Signature>/)[0]);
    return verifier.checkSignature(xml);
  }
  assert.equal(verify(signedXml), true);
  assert.equal(verify(signedXml.replace('<vNF>18.00</vNF>', '<vNF>19.00</vNF>')), false);
});

function authorization({ cStat = 100, accessKey = key.accessKey, protocol = '135260000000001' } = {}) {
  return `<retEnviNFe xmlns="${ns}" versao="4.00"><tpAmb>2</tpAmb><cStat>104</cStat><protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><chNFe>${accessKey}</chNFe><nProt>${protocol}</nProt><cStat>${cStat}</cStat><xMotivo>Resposta da SEFAZ</xMotivo></infProt></protNFe></retEnviNFe>`;
}

test('authorization requires a matching note, environment and actual SEFAZ protocol', () => {
  const parse = xml => parseSefazResult(xml, key.accessKey, environment, 'authorization');
  assert.equal(parse(authorization()).protocol, '135260000000001');
  assert.equal(parse(authorization({ accessKey: '0'.repeat(44) })).success, false);
  assert.equal(parse(authorization({ protocol: '' })).pending, true);
  const duplicate = parse(authorization({ cStat: 204 }));
  assert.equal(duplicate.success, false);
  assert.equal(duplicate.pending, true);
  assert.equal(duplicate.protocol, undefined);
  assert.equal(parse(authorization({ cStat: 225 })).pending, false);
  assert.throws(() => parseSefazResult(authorization(), key.accessKey, 'producao', 'authorization'), /Ambiente divergente/);
  assert.throws(() => parse('<fault/>'), /sem resultado fiscal/);
});
