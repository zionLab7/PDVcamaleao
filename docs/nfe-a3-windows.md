# Emissão fiscal com cartão A3

A GP Distribuidora usa o PDV na VPS com Docker, Portainer e Traefik. A estação fiscal roda na sessão do usuário do Windows onde está o leitor. Ela consulta a fila por HTTPS pelo domínio existente. A estação usa o cartão para assinatura e autenticação e transmite diretamente à SEFAZ-SP. O PIN, quando solicitado, é digitado no Windows.

O botão **Emitir NF-e modelo 55 para CNPJ** usa todos os itens, quantidades, valores, descontos e pagamentos da venda concluída. O fluxo de NF-e abrange venda direta interna para PJ em SP, CRT 1, sem cobrança separada de frete, com transporte próprio ou sem ocorrência de transporte, com CFOP 5101, 5102 ou 5405 quando aplicável e o recorte tributário documentado em [NFC-e SP](nfce-sp.md). Dados ausentes ou incompatíveis precisam ser corrigidos no cadastro fiscal. Preserve a série existente do emissor atual ou configure uma série distinta e confirmada. NF-e 55 e NFC-e 65 têm sequências independentes. Para operação já documentada, confira e recupere o XML existente. A saída anterior à emissão exige verificar o procedimento fiscal aplicável. Use uma venda de teste diferente da venda real.

## VPS

1. Faça backup do PostgreSQL existente e confira o branch do código. Na stack Portainer existente, mantenha o nome da stack, os volumes, o banco e as variáveis de ambiente. Confira que os segredos JWT e PostgreSQL são próprios da instalação.
2. Atualize usando o branch que contém esta integração e reconstrua os serviços `server` e `client`. Caso a stack seja executada via Compose no checkout, use `docker compose up -d --build server client`. O banco recebe campos e tabelas adicionais sem apagar vendas. Confira os logs do servidor para verificar o resultado de `prisma db push`.
3. Abra o PDV em HTTPS. Entre como administrador ou gerente. Em **Configurações → Dados Fiscais**, salve os dados reais do emitente, **A3 em cartão no Windows**, série e primeiro número da NF-e e **Homologação**. Ative a emissão fiscal e salve. Configure também NCM, CFOP, CSOSN, origem, PIS/COFINS, CEST e tributos aproximados dos produtos da venda conforme aplicável. Se o código de barras é o GTIN da unidade vendida e tributada, marque a opção correspondente no cadastro.
4. Em **Configurações → Dados Fiscais**, clique em **Gerar token para estação A3**. Cada novo token invalida o anterior. Guarde-o apenas no gerenciador de senhas se precisar reutilizá-lo ao reiniciar a estação.

## Windows

Abra o próprio Windows da empresa pelo Mac. Use a sessão do usuário que vê o certificado em `certmgr.msc → Pessoal → Certificados`. Se o leitor some sob RDP, teste pelo console via acesso remoto já configurado. No PowerShell do Windows, execute:

```powershell
certutil -scinfo
Get-ChildItem Cert:\CurrentUser\My | Where-Object HasPrivateKey |
    Select-Object Subject, Thumbprint, NotAfter
```

Confira o titular e a validade. Baixe **EstacaoFiscalA3.ps1** pelo botão do PDV nesse Windows. No PowerShell:

```powershell
Set-Location (Join-Path $env:USERPROFILE 'Downloads')
Unblock-File .\EstacaoFiscalA3.ps1
.\EstacaoFiscalA3.ps1 -PdvUrl 'https://app.distribuidoragpbrasil.com.br' -Thumbprint 'DIGITE_A_IMPRESSAO_DIGITAL_DO_CERTIFICADO' -Cnpj 'DIGITE_O_CNPJ_DO_EMITENTE'
```

Substitua os campos pela impressão digital de 40 caracteres e pelo CNPJ numérico de 14 dígitos. Use a origem HTTPS real da instalação se o domínio configurado na stack for outro. Se a política local impedir o script, peça ao administrador do Windows para autorizar o arquivo. Digite o token no prompt protegido e deixe a janela aberta. A estação precisa de acesso HTTPS de saída ao PDV e aos web services da SEFAZ-SP.

## Teste e emissão

1. No PDV, abra o comprovante de uma venda de teste. Clique em **Emitir NF-e modelo 55 para CNPJ**. Preencha apenas o destinatário, o canal, o transporte e a finalidade da compra. Revise a operação e envie à estação.
2. Confira o número da venda e o ambiente no Windows. Digite `S` e informe o PIN na janela do driver, se solicitado. A venda mostra o resultado no PDV. Se o Windows for interrompido após assinar, o XML assinado é mantido no PDV e a retomada consulta a chave original antes de retransmitir.
3. Depois de um teste autorizado de NF-e modelo 55 do mesmo emitente, confirme habilitação, série e numeração de produção. Mude o ambiente para **Produção**, abra **Relatórios → venda real → comprovante** e repita com os dados do cliente. Na venda autorizada, baixe o XML protocolado e o DANFE em PDF.
4. Se houver falha, confira a mensagem no Windows e no PDV. **Retomar ou consultar nota pendente** preserva a chave original. Caso a estação tenha sido encerrada no meio de uma operação, uma nova estação poderá retomá-la depois que a reserva de cinco minutos expirar. Se a SEFAZ rejeitar a nota, corrija a causa antes de solicitar nova emissão.

O fluxo A1 de NFC-e continua disponível. O suporte ao A3 foi escrito para o PowerShell 5.1 do Windows com o certificado acessível no repositório pessoal. A validação ponta a ponta precisa do cartão, do middleware, do PIN e da habilitação real do estabelecimento. Consulte os [web services de NF-e](https://portal.fazenda.sp.gov.br/servicos/nfe/Paginas/URL-WEBSERVICES.aspx) e os [de NFC-e](https://portal.fazenda.sp.gov.br/servicos/nfce/Paginas/WebServices.aspx).
