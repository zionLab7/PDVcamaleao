const { test } = require('node:test');
const assert = require('node:assert/strict');
const forge = require('node-forge');
const express = require('express');
const { prisma } = require('../dist/prisma');
const { generateTokens } = require('../dist/services/auth');
const { signNfceXml } = require('../dist/services/fiscal/xmlSigner');
const station = require('../dist/routes/fiscalA3');
const fiscal = require('../dist/routes/fiscal');

function makeSigner(cnpj) {
  const { asn1 } = forge;
  const universal = (type, value) => asn1.create(asn1.Class.UNIVERSAL, type, Array.isArray(value), value);
  const context = value => asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, value);
  const san = universal(asn1.Type.SEQUENCE, [context([
    universal(asn1.Type.OID, asn1.oidToDer('2.16.76.1.3.3').getBytes()),
    context([universal(asn1.Type.OCTETSTRING, cnpj)]),
  ])]);
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000);
  cert.setSubject([{ shortName: 'CN', value: 'Certificado ficticio' }]);
  cert.setIssuer(cert.subject.attributes);
  cert.setExtensions([{ id: '2.5.29.17', value: asn1.toDer(san).getBytes() }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return (xml, accessKey) => signNfceXml({
    xml, accessKey, pemKey: forge.pki.privateKeyToPem(keys.privateKey), pemCert: forge.pki.certificateToPem(cert),
  });
}

test('A3 accepts the ICP-Brasil CNPJ and rejects changed XML and another company', () => {
  const cnpj = '12345678000195';
  const key = '352611' + cnpj + '55' + '0'.repeat(22);
  const xml = `<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe${key}"><cUF>35</cUF></infNFe></NFe>`;
  const signed = makeSigner(cnpj)(xml, key);
  assert.equal(station.verifyStationSignature(xml, signed, key), true);
  assert.equal(station.verifyStationSignature(xml, signed.replace('>35<', '>41<'), key), false);
  assert.equal(station.verifyStationSignature(xml, makeSigner('98765432000100')(xml, key), key), false);
});

test('many sale items travel through the authenticated Windows queue and save one protocol', {
  skip: !process.env.PDV_A3_INTEGRATION_TEST,
}, async () => {
  const cnpj = '12345678000195';
  const suffix = Date.now();
  const tenant = await prisma.tenant.create({ data: { name: 'Teste A3', email: `a3-${suffix}@example.test`, password: 'test' } });
  const other = await prisma.tenant.create({ data: { name: 'Outra loja', email: `a3-other-${suffix}@example.test`, password: 'test' } });
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/a3', station.default);
  app.use('/fiscal', fiscal.default);
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const token = (tenantId, role = 'admin') => generateTokens({ tenantId, userId: 'test', role }).accessToken;
  const call = (accessToken, path, body) => fetch(url + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  try {
    await prisma.storeSetting.createMany({ data: [
      { tenantId: tenant.id, document: cnpj, enableNfce: true, fiscalCertificateMode: 'A3',
        stateRegistration: '110042490114', fiscalPostalCode: '01001000', fiscalStreet: 'Rua Teste',
        fiscalCityCode: '3550308', city: 'São Paulo', fiscalDistrict: 'Centro', fiscalLegalName: 'Teste Ltda',
        fiscalStreetNumber: '12', fiscalTaxSource: 'IBPT', nfeSeries: 871 },
      { tenantId: other.id, document: '98765432000100', fiscalCertificateMode: 'A3' },
    ] });
    const product = await prisma.product.create({ data: {
      tenantId: tenant.id, name: 'Item original', sellPrice: 10, ncm: '22021000', cfop: '5102',
      pisCst: '49', cofinsCst: '49', taxEstimateRate: 10,
    } });
    const sale = await prisma.sale.create({ data: {
      tenantId: tenant.id, total: 1190, subtotal: 1200, discount: 10,
      items: { create: Array.from({ length: 120 }, (_, i) => ({
        tenantId: tenant.id, productId: product.id, productName: `Produto da venda ${i + 1}`, quantity: 1,
        unitPrice: 10, total: 10,
      })) },
      payments: { create: { tenantId: tenant.id, method: 'pix', amount: 1190 } },
    } });
    const operator = token(tenant.id);
    assert.equal((await call(token(tenant.id, 'cashier'), '/a3/pair', {})).status, 403);
    const pairing = await call(operator, '/a3/pair', {});
    assert.equal(pairing.status, 200);
    const worker = (await pairing.json()).token;
    const otherWorker = (await (await call(token(other.id), '/a3/pair', {})).json()).token;
    const recipient = { cnpj: '33000167000101', name: 'Comprador SA', street: 'Rua Teste', number: '1',
      district: 'Centro', city: 'São Paulo', cityCode: '3550308', postalCode: '01001000',
      taxpayer: '9', finalConsumer: true, presence: '1' };
    const emitPath = `/fiscal/emit/${sale.id}`;
    const emit = await call(operator, emitPath, { recipient });
    assert.equal(emit.status, 200, await emit.clone().text());
    const pending = await emit.json();
    assert.equal(pending.fiscalStatus, 'pending');
    assert.equal(pending.accessKey.slice(20, 22), '55');
    assert.equal((await (await call(operator, emitPath, {})).json()).accessKey, pending.accessKey);
    assert.equal((await call(otherWorker, '/a3/next', {})).status, 204);
    const claims = await Promise.all([call(worker, '/a3/next', {}), call(worker, '/a3/next', {})]);
    assert.deepEqual(claims.map(r => r.status).sort(), [200, 204]);
    const job = await claims.find(r => r.status === 200).json();
    assert.match(job.unsignedXml, /<mod>55<\/mod>/);
    assert.match(job.unsignedXml, /<indFinal>1<\/indFinal>/);
    assert.match(job.unsignedXml, /<CNPJ>33000167000101<\/CNPJ>/);
    assert.match(job.unsignedXml, /<vNF>1190.00<\/vNF>/);
    assert.equal((job.unsignedXml.match(/<det nItem=/g) || []).length, 120);
    assert.doesNotMatch(job.unsignedXml, /infNFeSupl/);
    const signed = makeSigner(cnpj)(job.unsignedXml, job.accessKey);
    const jobPath = `/a3/jobs/${sale.id}`;
    assert.equal((await call(otherWorker, jobPath, { step: 'signed', leaseId: job.leaseId, xml: signed })).status, 409);
    assert.equal((await call(worker, jobPath, { step: 'signed', leaseId: job.leaseId, xml: signed })).status, 204);
    assert.equal((await call(worker, jobPath, { step: 'error', leaseId: job.leaseId, message: 'Falha simulada após assinar.' })).status, 204);
    await call(operator, emitPath, {});
    const retry = await (await call(worker, '/a3/next', {})).json();
    assert.notEqual(retry.leaseId, job.leaseId);
    assert.equal(retry.signedXml, signed);
    const digest = signed.match(/<DigestValue>([^<]+)<\/DigestValue>/)[1];
    const response = `<retConsSitNFe xmlns="http://www.portalfiscal.inf.br/nfe"><tpAmb>2</tpAmb><cStat>100</cStat><protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><chNFe>${job.accessKey}</chNFe><nProt>13526000000000123</nProt><digVal>${digest}</digVal><cStat>100</cStat></infProt></protNFe></retConsSitNFe>`;
    const write = (leaseId, xml) => call(worker, jobPath, { step: 'result', leaseId, operation: 'query', xml });
    assert.equal((await write(job.leaseId, response)).status, 409);
    assert.equal((await write(retry.leaseId, response.replace(digest, 'divergente'))).status, 409);
    assert.equal((await write(retry.leaseId, response)).status, 204);
    const final = await (await call(operator, `/fiscal/xml/${sale.id}`)).json();
    assert.match(final.xml, /<nfeProc /);
    assert.match(final.xml, /13526000000000123/);
    assert.equal((await (await call(operator, emitPath, {})).json()).accessKey, job.accessKey);
  } finally {
    await prisma.sale.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenant.id, other.id] } } });
    await prisma.nfeSequence.deleteMany({ where: { cnpj, environment: 'homologacao', series: 871 } });
    await prisma.$disconnect();
    await new Promise(resolve => server.close(resolve));
  }
});
