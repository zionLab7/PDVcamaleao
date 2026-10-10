# Impressão térmica de recibos

O recibo é impresso pelo navegador e pelo driver da impressora no computador do caixa.
A VPS, o Docker e o Traefik entregam o aplicativo; não enviam comandos ESC/POS para a impressora.

## Correção do contraste e da largura

Os estilos antigos definiam preto apenas no contêiner. Os elementos internos continuavam
com as classes cinza da tela, em tamanhos de 8–10 px. Drivers monocromáticos podem
transformar esses tons em pontos, tornando o texto fraco. A impressão agora usa preto
em todos os elementos, fonte Arial de no mínimo 11 px e títulos de 14 px.

A seleção de bobina agora determina a largura em milímetros: 58 mm com 48 mm de conteúdo
e 80 mm com 72 mm de conteúdo. O recibo impresso fica diretamente no `body`, fora do
modal, para evitar os limites de altura e os cortes dos contêineres de rolagem.
Descrições completas podem ocupar várias linhas. Prévia e impressão usam o mesmo conteúdo.

## Aplicar a atualização e testar

1. No Portainer, abra a stack do PDV e atualize-a com o código mais recente da branch `main`.
   É necessário reconstruir a imagem do serviço `client`: os arquivos React/CSS são
   compilados e copiados para o Nginx durante o build. Apenas reiniciar o contêiner antigo
   não aplica a correção. Se a atualização Git da stack não reconstruir a imagem,
   execute na VPS, na pasta do checkout atualizado do projeto:
   ```bash
   docker compose build client
   docker compose up -d --no-deps client
   ```
2. Recarregue o aplicativo no computador do caixa para buscar os arquivos novos.
3. Em Configurações, selecione a bobina de **58 mm** e salve.
4. Ao imprimir, selecione a térmica e o papel de **58 mm** no driver. Use escala **100%**,
   margens **nenhuma** e desative cabeçalhos/rodapés do navegador. Não use ajuste para A4.
   O comprimento da bobina/página é controlado pelo driver; o aplicativo não fixa uma
   altura que poderia cortar vendas com muitos itens.
5. Reimprima uma venda. Confira CNPJ, data, quantidades, preços, total e rodapé; confira
   também um produto com descrição longa. Se houver NFC-e, teste a leitura do QR Code.

O teste físico ainda precisa ser realizado na impressora do caixa. Se persistirem falhas
com texto preto, registre modelo, sistema operacional, navegador e driver utilizados,
além do resultado de uma impressão do mesmo recibo salva em PDF.

## Teste de regressão

```bash
npm ci
npx playwright install chromium
npm run test:print -w client
npm run build:client
```

Os testes usam o componente real em Chromium, nas duas larguras, com e sem dados fiscais,
e vendas de 60 itens. Verificam contraste, tamanho mínimo, ausência de texto fora da área
útil, totais, rodapé, QR Code e isolamento do modal, sem depender do banco ou da SEFAZ.
