# NFC-e direta na SEFAZ-SP

O PDV transmite NFC-e modelo 65 em XML 4.00, com certificado digital A1, para o varejo paulista enquadrado no CRT 1. O QR Code online versão 3 dispensa o CSC na geração do XML. A transmissão usa os web services públicos da SEFAZ-SP e dispensa contrato com uma API fiscal. A empresa precisa de certificado válido e credenciamento fiscal.

## Preparar o servidor

1. Faça backup do banco. Garanta que a publicação aplique as alterações aditivas do Prisma.
2. Gere uma chave com `openssl rand -hex 32`. Salve o resultado como `FISCAL_ENCRYPTION_KEY` no ambiente do backend (no arquivo `.env` da implantação Compose). Proteja a chave e guarde-a com segurança para restauração. O servidor precisa da mesma chave após atualizações.
3. Recompile servidor e cliente. No Compose, execute `docker compose up -d --build server client`. O backend precisa acessar os web services da SEFAZ-SP por HTTPS.
4. Caso um certificado já tenha sido cadastrado, reinstale-o. A atualização grava o PFX e a senha criptografados. Versões anteriores devolviam esses segredos em respostas da API de configurações. Avalie com o responsável pelo certificado a necessidade de revogação e substituição, especialmente se houve acesso indevido. Proteja também os backups antigos.

## Homologar e começar a emitir

1. Confira o credenciamento do estabelecimento no [portal da NFC-e de São Paulo](https://portal.fazenda.sp.gov.br/servicos/nfce/Paginas/Sobre.aspx).
2. Entre no PDV como administrador ou gerente. Abra **Configurações → Dados Fiscais**. Informe CNPJ, IE, razão social, endereço fiscal, município, CEP e código IBGE reais. Use SP, CRT 1 e Homologação. Informe a fonte da carga tributária aproximada adotada pela empresa.
3. Configure uma série própria para o PDV ou alinhe a numeração com o responsável fiscal. O primeiro número só vale quando o PDV inicia uma combinação de CNPJ, ambiente e série. A sequência do novo emissor é independente do contador legado. Consulte as autorizações e inutilizações anteriores na SEFAZ antes de usar uma série preexistente.
4. Instale o e-CNPJ A1 (.pfx ou .p12) em Dados Fiscais e informe a senha nessa mesma tela. Ative a emissão e salve as configurações.
5. Em **Estoque → Editar produto**, confira NCM, CFOP, origem, CSOSN, CEST quando aplicável, CST de PIS e COFINS e o percentual de carga aproximada de cada item, usando a classificação da contabilidade. O emissor atende os CSOSN 102, 103, 300, 400 e 500 sem valores de retenção detalhados, e CSTs 04–09, 49 e 99 de PIS/COFINS sem contribuição destacada. Confirme o enquadramento do catálogo antes de usar esse recorte.
6. Use uma venda de teste isolada da operação comercial. No comprovante, clique **Emitir NFC-e na SEFAZ**. Confirme a chave e o protocolo de homologação no QR Code e baixe o XML protocolado. Teste desconto, Pix por chave, cartão em maquininha externa e dinheiro com troco conforme os meios usados na loja.
7. Após homologação real para o CNPJ, inicie produção com credenciamento e numeração confirmados. Uma venda que já tem NFC-e de homologação fica vinculada a esse documento. Use uma venda distinta para o primeiro documento de produção.
8. Quando houver emissão pendente, reabra o comprovante em Relatórios e use **Consultar NFC-e pendente**. O PDV consulta a chave original e só retransmite o mesmo XML se a SEFAZ responder que a chave não consta. Para vendas legadas marcadas como autorizadas, confira a chave e recupere o XML original na SEFAZ antes de qualquer nova emissão.

A operação implementada é emissão online pelo comprovante. Contingência, eventos de cancelamento, inutilização de números rejeitados sem uso, pagamentos eletrônicos integrados e regras do IBS/CBS do Simples da NT 2026.005 precisam de tratamento próprio. Vendas com documento pendente ou autorizado ficam protegidas contra estorno apenas comercial no PDV. Alinhe os procedimentos de exceção com a contabilidade antes de iniciar emissão regular. Consulte os [Web Services paulistas](https://portal.fazenda.sp.gov.br/servicos/nfce/Paginas/WebServices.aspx) e as [Notas Técnicas nacionais](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=04BIflQt1aY%3D).
