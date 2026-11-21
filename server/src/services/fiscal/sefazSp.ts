import https from 'https';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { randomInt } from 'crypto';
import { FiscalEnvironment } from './types';

const namespace = 'http://www.portalfiscal.inf.br/nfe';

interface Connection {
  pfxBase64: string;
  certificatePassword?: string;
  environment: FiscalEnvironment;
}

async function requestSefaz(connection: Connection, service: string, xml: string): Promise<string> {
  const host = connection.environment === 'producao'
    ? 'nfce.fazenda.sp.gov.br'
    : 'homologacao.nfce.fazenda.sp.gov.br';
  const wsdl = `${namespace}/wsdl/${service}`;
  const envelope = `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeDadosMsg xmlns="${wsdl}">${xml}</nfeDadosMsg></soap:Body></soap:Envelope>`;

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: host,
      path: `/ws/${service}.asmx`,
      method: 'POST',
      agent: false,
      pfx: Buffer.from(connection.pfxBase64.replace(/^data:.*?;base64,/, ''), 'base64'),
      passphrase: connection.certificatePassword,
      minVersion: 'TLSv1.2',
      headers: {
        'Content-Type': `application/soap+xml; charset=utf-8; action="${wsdl}/${service === 'NFeAutorizacao4' ? 'nfeAutorizacaoLote' : 'nfeConsultaNF'}"`,
        'Content-Length': Buffer.byteLength(envelope),
      },
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        body += chunk;
        if (body.length > 1_000_000) req.destroy(new Error('Resposta SEFAZ excedeu o limite.'));
      });
      res.on('error', reject);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(body);
        else reject(new Error(`SEFAZ retornou HTTP ${res.statusCode}.`));
      });
    });
    const timeout = setTimeout(() => req.destroy(new Error('Tempo limite de comunicação com a SEFAZ.')), 15000);
    req.once('close', () => clearTimeout(timeout));
    req.on('error', reject);
    req.end(envelope);
  });
}

export function parseSefazResult(xml: string, accessKey: string, environment: FiscalEnvironment, operation: 'authorization' | 'query') {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const response = document.getElementsByTagNameNS(namespace, operation === 'authorization' ? 'retEnviNFe' : 'retConsSitNFe').item(0);
  if (!response) throw new Error('Resposta da SEFAZ sem resultado fiscal.');
  const read = (element: NonNullable<typeof response>, tag: string) =>
    Array.from(element.childNodes).find(node => node.nodeType === 1 && node.localName === tag)?.textContent?.trim();
  const env = environment === 'producao' ? '1' : '2';
  if (read(response, 'tpAmb') !== env) throw new Error('Ambiente divergente na resposta da SEFAZ.');

  const protocolElement = response.getElementsByTagNameNS(namespace, 'protNFe').item(0);
  const info = protocolElement?.getElementsByTagNameNS(namespace, 'infProt').item(0);
  const outerStatus = Number(read(response, 'cStat'));
  const cStat = Number(read(info || response, 'cStat'));
  const xMotivo = read(info || response, 'xMotivo') || 'Sem motivo informado pela SEFAZ.';
  if (!cStat) throw new Error('Resposta da SEFAZ sem código fiscal.');
  const protocol = info && read(info, 'nProt');
  const success = (cStat === 100 || cStat === 150)
    && (operation === 'authorization' ? outerStatus === 104 : outerStatus === cStat)
    && !!protocol && /^\d{15,17}$/.test(protocol) && read(info!, 'chNFe') === accessKey
    && read(info!, 'tpAmb') === env;

  return {
    success,
    cStat,
    xMotivo,
    protocol: success ? protocol : undefined,
    protocolXml: success ? new XMLSerializer().serializeToString(protocolElement!) : undefined,
    pending: !success && ([100, 103, 104, 105, 106, 108, 109, 150, 204, 539, 999].includes(cStat) || operation === 'query'),
  };
}

export async function sendNfceToSefazSp(connection: Connection, signedXml: string, accessKey: string) {
  const body = `<enviNFe xmlns="${namespace}" versao="4.00"><idLote>${randomInt(10000000, 100000000)}</idLote><indSinc>1</indSinc>${signedXml}</enviNFe>`;
  return parseSefazResult(await requestSefaz(connection, 'NFeAutorizacao4', body), accessKey, connection.environment, 'authorization');
}

export async function queryNfceAtSefazSp(connection: Connection, accessKey: string) {
  const tpAmb = connection.environment === 'producao' ? '1' : '2';
  const body = `<consSitNFe xmlns="${namespace}" versao="4.00"><tpAmb>${tpAmb}</tpAmb><xServ>CONSULTAR</xServ><chNFe>${accessKey}</chNFe></consSitNFe>`;
  return parseSefazResult(await requestSefaz(connection, 'NFeConsultaProtocolo4', body), accessKey, connection.environment, 'query');
}
