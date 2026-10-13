# Caixa da Larinha

App pessoal para controlar as finanças do mês, feito para usar no celular:

- **Contas a pagar**: checklist mensal com vencimento, aviso de atrasadas e das que vencem nos próximos 3 dias.
- **Gastos do dia a dia**: lançamento rápido com categoria e forma de pagamento (Pix, débito, crédito…), total por categoria e limite mensal.
- **Cartões de crédito e parcelas**: cadastre o cartão com os dias de fechamento e vencimento. Compras no crédito vão para a fatura certa, e as parceladas se espalham pelos meses seguintes. A fatura aparece no checklist de contas.
- **Lembretes na agenda**: o botão “Adicionar vencimentos à agenda” gera um arquivo de calendário com cada conta e fatura, com aviso 2 dias antes e no dia.
- **Sobra prevista**: renda − contas fixas − gastos.
- **Funciona offline** e instala na tela inicial como aplicativo (PWA).
- **Backup**: os dados ficam só no aparelho. Exporte um arquivo `.json` de vez em quando e importe quando trocar de celular.

Não tem servidor, login nem banco de dados. É um site estático: `index.html`, `styles.css`, `app.js`.

## Publicar no GitHub Pages

1. Crie um repositório no GitHub, por exemplo `caixa-da-larinha` (pode ser público ou privado*).
2. Envie os arquivos desta pasta para o repositório:
   ```bash
   cd caixa-da-larinha
   git init
   git add .
   git commit -m "Caixa da Larinha: primeira versão"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/caixa-da-larinha.git
   git push -u origin main
   ```
   Sem usar o terminal: no repositório recém-criado, clique em **uploading an existing file** e arraste todos os arquivos e a pasta `icons`.
3. No repositório, vá em **Settings → Pages**. Em **Source**, escolha **Deploy from a branch**, branch **main**, pasta **/ (root)** e clique em **Save**.
4. Em 1 ou 2 minutos o app fica no ar em `https://SEU-USUARIO.github.io/caixa-da-larinha/`.

\* GitHub Pages em repositório privado só funciona em planos pagos do GitHub. No plano grátis, deixe o repositório público. Os seus dados financeiros **não** vão para o GitHub, apenas o código do app. Os lançamentos ficam só no celular.

## Instalar no celular

- **Android (Chrome)**: abra o link. Aparece o botão **Instalar app** no topo, ou use o menu ⋮ → **Instalar aplicativo**.
- **iPhone (Safari)**: abra o link no Safari, toque em **Compartilhar** → **Adicionar à Tela de Início**.

Depois de instalado, o app abre em tela cheia e funciona sem internet.

## Lembretes na agenda

- **iPhone**: toque em “Adicionar vencimentos à agenda”, escolha abrir com **Calendário** e toque em **Adicionar tudo**. Os avisos (2 dias antes e no dia, às 9h) já vêm configurados.
- **Android**: escolha abrir o arquivo com o app de agenda do celular. Se o Google Agenda não abrir o arquivo, importe pelo computador em calendar.google.com → Configurações → Importar e exportar. O Google Agenda usa os avisos padrão da sua agenda, não os do arquivo.
- Ao cadastrar contas ou cartões novos, gere o arquivo de novo. Na agenda do iPhone, os eventos repetidos são reconhecidos; em outras agendas podem aparecer duplicados.

## Cuidados com os dados

- Os dados ficam no armazenamento do navegador do celular. **Limpar os dados do navegador ou desinstalar o app apaga tudo.** Por isso, use **Exportar backup** com frequência (o celular abre o menu para salvar no Drive ou mandar no WhatsApp).
- Dados do celular e do computador são separados. Para levar de um para o outro, exporte o backup em um e importe no outro.

## Atualizar o app

Depois de alterar qualquer arquivo, aumente o número de `VERSAO` em `sw.js` (por exemplo `v1` → `v2`) e envie para o GitHub. Na próxima vez que o app abrir com internet, ele baixa a versão nova.

## Testar no computador

```bash
cd caixa-da-larinha
python3 -m http.server 8080
```
Abra `http://localhost:8080`. O service worker só funciona via `http://localhost` ou `https://`, não abrindo o arquivo direto.
