# Impressão térmica de recibos

O recibo é impresso pelo navegador e pelo driver da impressora no computador do caixa.
A VPS, o Docker e o Traefik entregam o aplicativo; não enviam comandos ESC/POS para a impressora.

## Correção do contraste e da largura

Os estilos antigos definiam preto apenas no contêiner. Os elementos internos continuavam
com as classes cinza da tela, em tamanhos de 8–10 px. Drivers monocromáticos podem
transformar esses tons em pontos, tornando o texto fraco. A impressão agora usa preto
em todos os elementos, fonte Arial de no mínimo 11 px e títulos de 14 px.

## Documento exclusivo para impressão

O botão de impressão agora prepara um documento separado, em um iframe, sem os
estilos responsivos do aplicativo. Ele espera o carregamento do documento, das fontes
locais e das imagens, e define uma página física de **58 mm ou 80 mm**. A altura é
medida a partir do próprio recibo; vendas acima de 1 metro são paginadas mantendo a
mesma largura. Isso substitui a chamada a `window.print()` sobre a página inteira,
que deixava o tamanho da página como `auto`.

Os valores ficam na coluna da esquerda, junto de seus rótulos. O NCM ocupa uma linha
separada. Não há mais uma coluna de valores encostada na borda direita. O bloco tem
44 mm para bobina de 58 mm ou 68 mm para bobina de 80 mm, incluindo 1 mm de folga
interna em cada lado. Cabeçalho, descrições, pagamentos, total, rodapé e dados fiscais
são copiados do mesmo conteúdo da prévia, sem reconstruir ou recalcular a venda.

O seletor **Bobina deste caixa** salva 58/80 mm neste navegador/computador. Essa
preferência tem prioridade sobre o padrão da loja e permanece nas próximas vendas
e após recarregar o aplicativo. Quando não há preferência local, o padrão salvo da
loja é utilizado. Em navegadores com armazenamento bloqueado, a impressão funciona,
mas a escolha pode precisar ser repetida. Para trocar de impressora, altere o seletor.

O atalho Ctrl+P mantém um layout de segurança na página principal, mas o fluxo com
página física definida é o botão **Imprimir Cupom (58 mm)** / **Imprimir DANFE NFC-e**.

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
3. No recibo, escolha **58 mm** em **Bobina deste caixa**. O botão deverá mostrar
   **Imprimir Cupom (58 mm)**. A escolha fica salva neste computador; o padrão de
   Configurações também pode ser ajustado, mas não sobrescreve a escolha local do caixa.
4. Ao imprimir, selecione a térmica e o papel de **58 mm** no driver. Use escala **100%**,
   margens **nenhuma** e desative cabeçalhos/rodapés do navegador. Não use ajuste para A4.
   O comprimento da bobina/página é controlado pelo driver; o aplicativo não fixa uma
   altura que poderia cortar vendas com muitos itens.
5. Reimprima uma venda. Confira CNPJ, data, quantidades, preços, total e rodapé; confira
   também um produto com descrição longa. Se houver NFC-e, teste a leitura do QR Code.

O código não pode configurar remotamente o driver, a escala do diálogo de impressão
ou a largura física da impressora. Se o documento de 58 mm ainda for cortado, é
necessário examinar uma captura completa do diálogo de impressão (incluindo papel,
escala e margens), o modelo da impressora e seu driver. Salvar o mesmo recibo em PDF
pelo diálogo permite separar um corte no documento de um corte provocado pelo driver.
O teste físico precisa ser concluído na impressora do caixa.

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
Também verificam a preferência local após abrir outra venda, a preparação do documento
isolado, o fim do diálogo de impressão e a ausência de valores na borda direita.
O Chromium gera PDFs a partir do documento efetivamente emitido. Os testes conferem
que todas as páginas possuem a largura física de 58/80 mm, em vendas de 1 e 60 itens,
e preservam arquivos PDF e capturas como anexos dos resultados.
