import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('the existing receipt requests NF-e for a CNPJ and downloads the authorized A4 DANFE', async ({ page }) => {
  const key = '35261112345678000195550010000001231123456780';
  const issuer = '<xNome>Distribuidora de teste</xNome><CNPJ>12345678000195</CNPJ><IE>110042490114</IE><enderEmit><xLgr>Rua A</xLgr><nro>1</nro><xBairro>Centro</xBairro><xMun>São Paulo</xMun><CEP>01001000</CEP></enderEmit>';
  const items = Array.from({ length: 120 }, (_, index) =>
    `<det nItem="${index + 1}"><prod><cProd>SKU-${index + 1}</cProd><xProd>Produto fiscal ${index + 1}</xProd><NCM>22021000</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>1</qCom><vUnCom>20</vUnCom><vProd>20</vProd></prod><imposto><ICMS><ICMSSN102><CSOSN>102</CSOSN></ICMSSN102></ICMS></imposto></det>`).join('');
  const xml = `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe Id="NFe${key}"><ide><mod>55</mod><nNF>123</nNF><serie>1</serie><dhEmi>2026-11-25T10:00:00-03:00</dhEmi><tpAmb>2</tpAmb><natOp>VENDA DE MERCADORIAS</natOp></ide><emit>${issuer}</emit><dest>${issuer}</dest>${items}<total><ICMSTot><vProd>2400.00</vProd><vNF>2400.00</vNF></ICMSTot></total></infNFe></NFe><protNFe><infProt><chNFe>${key}</chNFe><nProt>13526000000000123</nProt><cStat>100</cStat></infProt></protNFe></nfeProc>`;
  await page.route('**/api/fiscal/emit/test', route => {
    const { recipient } = route.request().postDataJSON();
    expect(recipient).toMatchObject({ cnpj: '33000167000101', taxpayer: '9', finalConsumer: true, presence: '1' });
    expect(route.request().postDataJSON().items).toBeUndefined();
    return route.fulfill({ json: { success: false, fiscalStatus: 'pending', accessKey: key } });
  });
  await page.route('**/api/fiscal/status/test', route => route.fulfill({ json: {
    success: true, fiscalStatus: 'authorized', accessKey: key, number: 123, series: 1,
    protocol: '13526000000000123', environment: 'homologacao',
  } }));
  await page.route('**/api/fiscal/xml/test', route => route.fulfill({ json: { xml, fileName: `${key}-procNFe.xml` } }));
  await page.goto('/tests/fixtures/receipt.html?items=120&a3');
  await page.getByRole('button', { name: 'Emitir NF-e modelo 55 para CNPJ' }).click();
  const fields = {
    'CNPJ do destinatário': '33000167000101', 'Razão social': 'Comprador PJ', 'Logradouro': 'Rua de teste',
    'Número': '1', 'Bairro': 'Centro', 'Município (SP)': 'São Paulo', 'Código IBGE do município': '3550308', 'CEP': '01001000',
  };
  for (const [label, value] of Object.entries(fields)) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel('Inscrição estadual').selectOption('9');
  await page.getByLabel('Finalidade da compra').selectOption('yes');
  await page.getByLabel('Canal da venda').selectOption('1');
  await page.getByLabel('Transporte').selectOption('9');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Enviar para estação A3' }).click();
  await expect(page.getByText('NF-e #123 autorizada em homologação')).toBeVisible({ timeout: 15000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar DANFE em PDF' }).click();
  const pdf = await download;
  expect(pdf.suggestedFilename()).toBe(`DANFE-${key}.pdf`);
  const content = await readFile((await pdf.path())!);
  expect(content.subarray(0, 4).toString()).toBe('%PDF');
  expect(content.toString('latin1').match(/\/Type \/Page\b/g)?.length).toBeGreaterThan(1);
});
