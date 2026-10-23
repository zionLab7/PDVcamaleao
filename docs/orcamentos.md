# Orçamentos e propostas em PDF A4

## Uso

1. Abra **Orçamentos > Novo orçamento** no menu do PDV.
2. Preencha cliente, CPF/CNPJ, contato, endereço e validade. O nome do cliente e a validade são obrigatórios.
3. Busque produtos pelo nome ou código de barras. Adicione/remova itens, ajuste quantidades, preços e descontos por item ou desconto adicional.
4. Informe condições de pagamento, entrega e observações.
5. Use **Salvar orçamento** para guardar no banco ou **Salvar e baixar PDF A4** para guardar e baixar a proposta para enviar ao cliente. O PDF usa os dados da loja das configurações, tabelas com descrições completas, NCM, unidade, quantidades, preços, descontos, total e páginas numeradas. Não depende do driver da impressora térmica.
6. Na lista, busque por número, cliente, documento ou telefone e filtre por situação. Orçamentos vencidos são identificados automaticamente pela validade, no fuso de São Paulo. É possível marcar a negociação como Em aberto, Aceito ou Recusado.
7. Quando o cliente aceitar, abra o orçamento, revise os itens e clique em **Converter em venda**. O caixa precisa estar aberto. Orçamentos vencidos devem ter a validade atualizada; recusados precisam ser reabertos.
8. Conclua o pagamento normal do PDV (dinheiro, PIX, cartão, fiado ou pagamento dividido). O recibo térmico continua no fluxo existente.

## Persistência e regras

- Os orçamentos são armazenados no PostgreSQL, separados por loja, e ficam disponíveis após recarregar ou trocar de computador. O PDF pode ser baixado novamente na lista.
- As descrições, códigos, unidades, NCM e preços são copiados do catálogo ao salvar. Alterar o catálogo não muda retroativamente a proposta salva; editar/salvar uma proposta atualiza seus dados de produto.
- Criar ou editar orçamento **não reserva nem baixa estoque**, não movimenta caixa e não entra nos relatórios de vendas.
- Totais são recalculados no servidor com arredondamento por item. Desconto por item é um valor absoluto sobre a linha, não percentual; desconto adicional é aplicado sobre a soma líquida dos itens.
- A conversão usa os itens e totais salvos, verifica a versão e grava venda, estoque, caixa e vínculo em uma transação. Cliques/requisições repetidos não criam uma segunda venda para o mesmo orçamento.
- Produtos removidos/inativos devem ser substituídos antes da conversão. Quantidade em estoque segue o comportamento atual do PDV; o orçamento não promete reserva.
- Orçamentos convertidos ficam somente para consulta/PDF e mostram o número da venda. O cancelamento da venda restaura estoque e caixa pelo fluxo existente; o orçamento mantém seu vínculo e não é reaberto automaticamente.
- Se outro operador alterar a proposta enquanto ela estiver aberta, a gravação/conversão é bloqueada por versão. Reabra-a para carregar a versão atual.
- O PDF é uma proposta comercial, sem valor fiscal ou de comprovante de pagamento. O envio ao cliente é feito pelo usuário após o download.

## Aplicar no Portainer / Docker

Esta versão altera **frontend e backend**, além de acrescentar a tabela `Quote` ao banco. Atualize a mesma stack pelo Git e **reconstrua as imagens de `server` e `client`**. O volume `pgdata` continua o mesmo; não há exclusão nem alteração dos cadastros existentes.

Pelo terminal no checkout atualizado, o equivalente é:

```sh
docker compose build server client
docker compose up -d server client
docker compose logs --tail=100 server
```

Na inicialização, o comando já usado pelo projeto (`prisma db push`) cria a tabela nova, seus índices e vínculos. Confira os logs para confirmar a sincronização do esquema e a inicialização do servidor. Depois recarregue o PDV e abra **Orçamentos**.

## Validação

```sh
npm install
npx prisma generate --schema server/prisma/schema.prisma
npm run build
cd client
npx playwright install chromium
npm run test:print
```

Os testes do navegador usam API simulada e verificam criação, edição, remoção de itens, persistência após recarga, conversão pelo pagamento, filtros, consulta de convertidos e download dos PDFs com 1/80 itens, além da regressão térmica.

Os testes de integração usam uma base PostgreSQL **de testes** com o esquema aplicado. Criam duas lojas próprias e removem somente seus registros ao final:

```sh
DATABASE_URL='postgresql://usuario:senha@localhost:5432/pdv_test' npm run test:quotes -w server
```

Nesta implementação, também foram executados com Prisma e um banco PGlite isolado via protocolo PostgreSQL (uma conexão). Isso valida transações e requisições duplicadas serializadas; a concorrência de múltiplas conexões deve ser validada em PostgreSQL nativo no ambiente de homologação.
