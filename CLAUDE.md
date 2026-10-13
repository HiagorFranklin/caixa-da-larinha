# Caixa da Larinha — contexto para o Claude Code

App pessoal de finanças (PWA estático, em português do Brasil), publicado no GitHub Pages e usado no celular.

## Estrutura
- `index.html`: marcação. Quatro abas (`#v-inicio`, `#v-contas`, `#v-gastos`, `#v-ajustes`) trocadas por `goTab()`, barra de abas fixa no rodapé, ícones como `<symbol>` SVG no topo do body.
- `styles.css`: estilos. Identidade delicada (rosa-pétala e orquídea, Fraunces nos títulos, Nunito no texto). Cores e fontes são tokens em `:root`, com tema escuro via `prefers-color-scheme`; categorias usam `--k0`…`--k9` na ordem de `CATS`. Não use cores literais fora dos tokens (exceto o branco sobre os gradientes do cartão de destaque e dos cartões de crédito).
- `app.js`: toda a lógica, em JS puro (sem build, sem framework).
- `sw.js`: service worker (offline). **A cada mudança, aumente `VERSAO` em `sw.js` e use o mesmo valor no `?vN` de `styles.css` e `app.js` no `index.html`.** Sem isso, a página nova pode abrir com o estilo/script antigo do cache.
- `manifest.webmanifest` e `icons/`: instalação como app.

## Dados
- Tudo em `localStorage`, chave `caixa-da-larinha:v1`, um objeto JSON:
  - `contas[id]`: `{nome, valor, dia, categoria, recorrente, mes?, inicio}`. `recorrente:false` vale só para `mes` (YYYY-MM). `inicio` (YYYY-MM) evita que contas novas apareçam em meses anteriores.
  - `pagamentos["<contaId>_<YYYY-MM>"]`: `{contaId, mes, pagoEm (YYYY-MM-DD), valor}`.
  - `gastos[id]`: `{descricao, valor, data (YYYY-MM-DD), categoria, forma, cartaoId?, parcelas?}`. `valor` é o total da compra. Com `forma: "Crédito"` e um `cartaoId` válido, a compra entra nas faturas (ver `mesDaFatura` e `valorParcela`); sem cartão conta como à vista.
  - `cartoes[id]`: `{nome, fechamento, vencimento}` (dias do mês). Compras a partir do dia do fechamento vão para a fatura seguinte; a fatura vence no mesmo mês do fechamento se `vencimento > fechamento`, senão no mês seguinte.
  - Faturas não são salvas: são calculadas por mês (`faturasDoMes`) e aparecem no checklist com id `fatura-<cartaoId>`; o pagamento fica em `pagamentos["fatura-<cartaoId>_<YYYY-MM>"]`.
  - `config`: `{renda, meta, ultimoBackup}`.
- O backup exporta e importa esse mesmo objeto. Mudanças de formato precisam manter a importação de backups antigos (ver `normalize()`).

## Totais do mês
- Contas fixas = contas cadastradas do mês (sem faturas).
- Gastos do mês = compras à vista feitas no mês + parcelas de cartão que caem na fatura do mês. As categorias e o limite usam esse mesmo total.
- Sobra prevista = renda − contas fixas − gastos do mês.

## Agenda
- `gerarICS()` monta um .ics com um evento mensal por conta e por cartão (dias 29–31 usam `BYMONTHDAY=28..N;BYSETPOS=-1`), com alarmes 2 dias antes e no dia às 9h.

## Detalhes de interface
- Ao pagar a última conta do mês, `hearts()` solta corações na tela (desligado com `prefers-reduced-motion`).
- Categoria e forma de pagamento do gasto são escolhidas por botões (`#catPick`, `#formaPick`) que espelham os `<select>` ocultos `#gCat` e `#gForma`.

## Convenções
- Valores em reais aceitam vírgula (`parseValor`) e são exibidos com `Intl.NumberFormat("pt-BR")`.
- Nada de `alert/confirm`: exclusões usam o botão de dois toques (`armDelete`).
- Precisa funcionar em tela de celular (~380px) e no iPhone instalado (safe areas).
- Não adicionar servidor nem envio de dados para fora: os dados financeiros ficam só no aparelho.
