# Caixa da Larinha — contexto para o Claude Code

App pessoal de finanças (PWA estático, em português do Brasil), publicado no GitHub Pages e usado no celular.

## Estrutura
- `index.html`: marcação da tela única.
- `styles.css`: estilos. Cores e fontes são tokens em `:root`, com tema escuro via `prefers-color-scheme`. Não use cores literais fora dos tokens.
- `app.js`: toda a lógica, em JS puro (sem build, sem framework).
- `sw.js`: service worker (offline). **Aumente `VERSAO` a cada mudança em qualquer arquivo do app.**
- `manifest.webmanifest` e `icons/`: instalação como app.

## Dados
- Tudo em `localStorage`, chave `caixa-da-larinha:v1`, um objeto JSON:
  - `contas[id]`: `{nome, valor, dia, categoria, recorrente, mes?, inicio}`. `recorrente:false` vale só para `mes` (YYYY-MM). `inicio` (YYYY-MM) evita que contas novas apareçam em meses anteriores.
  - `pagamentos["<contaId>_<YYYY-MM>"]`: `{contaId, mes, pagoEm (YYYY-MM-DD), valor}`.
  - `gastos[id]`: `{descricao, valor, data (YYYY-MM-DD), categoria, forma}`.
  - `config`: `{renda, meta, ultimoBackup}`.
- O backup exporta e importa esse mesmo objeto. Mudanças de formato precisam manter a importação de backups antigos (ver `normalize()`).

## Convenções
- Valores em reais aceitam vírgula (`parseValor`) e são exibidos com `Intl.NumberFormat("pt-BR")`.
- Nada de `alert/confirm`: exclusões usam o botão de dois toques (`armDelete`).
- Precisa funcionar em tela de celular (~380px) e no iPhone instalado (safe areas).
- Não adicionar servidor nem envio de dados para fora: os dados financeiros ficam só no aparelho.
