# LP Clube Suprema

A LP tem duas versões, escolhidas pela variável `FLOW`:

- **`convite` (padrão, pronta para ir ao ar):** pede só o e-mail, mostra o link oficial do clube (abre o app já no clube 10001 com o agente 1439098) e leva para comprar fichas no Fichas 24h. Não depende de nenhuma integração. O painel mostra os leads e quem clicou em cada passo. Como publicar: [docs/colocar-no-ar.md](docs/colocar-no-ar.md).
- **`completo`:** o cadastro único descrito abaixo. Depende da camada real; o que pedir aos devs está em [docs/pedido-devs.md](docs/pedido-devs.md).

Para rodar a versão completa localmente:

```bash
FLOW=completo node server.js
```

No PowerShell: `$env:FLOW="completo"; node server.js`

## Versão completa: cadastro único

Página onde o jogador se cadastra **só com e-mail e senha** e a camada por trás cria a conta na **Suprema**. No primeiro depósito ele informa CPF, celular e nascimento (o Fichas 24h exige esses dados para processar o PIX), paga o **PIX na própria página** e recebe o **link oficial de convite do clube**, que abre o app (ou a loja) já no clube 10001 com o agente 1439098.

Hoje as duas integrações estão **simuladas** (modo teste): nada é criado de verdade e o PIX gerado não pode ser pago.

## Como rodar

Precisa só do Node 20 ou mais novo. Não há nada para instalar.

```bash
node server.js
```

- LP: http://localhost:3000
- Link que já abre o cadastro (bom para anúncios): http://localhost:3000/#cadastro
- Painel de cadastros: http://localhost:3000/admin (só abre neste computador)
- No celular, na mesma rede Wi-Fi: o endereço "Celular" que aparece no terminal

## Como testar o fluxo

Na versão convite: clique em **Quero jogar**, informe um e-mail e confira os 3 passos (link do clube, comprar fichas, suporte). Os cliques aparecem no painel.

Na versão completa (rode com `FLOW=completo`):

1. Clique em **Quero jogar** e preencha e-mail e senha. No modo teste existe o botão **Preencher com dados de teste** (senha de teste: `Teste@123`).
2. Na confirmação, o código do e-mail é **123456**. A página mostra esse código no modo teste.
3. No depósito, escolha o valor e preencha CPF, celular e nascimento. No modo teste, CPFs com todos os dígitos iguais (ex.: `111.111.111-11`) são aceitos; no modo real eles são recusados.
4. Clique em **Gerar PIX** e depois em **Simular pagamento (modo teste)**.
5. Na tela final: no celular aparece o botão do link do clube; no computador aparece o QR desse link para abrir no celular.
6. Acompanhe tudo em http://localhost:3000/admin.

Depois de mudar arquivos do servidor (`server.js`, `lib/`, `adapters/`, `config.js`), pare e rode `node server.js` de novo. Mudanças em `public/` aparecem só recarregando a página.

### Situações para testar

| Para simular | Faça assim |
|---|---|
| Conta já existente na Suprema | e-mail com `+existe`, ex.: `joao+existe@exemplo.com` (a página pede o ID da Suprema) |
| Conta já existente no Fichas 24h | e-mail com `+f24hexiste` (a camada faz login no lugar do cadastro) |
| Suprema fora do ar | apelido com `falha`, ex.: `falha01` (a 1ª tentativa falha e o sistema tenta de novo sozinho) |
| Código errado | qualquer código diferente de 123456 |
| Retomar depois | feche o painel ou recarregue a página: aparece "Continuar" |

## Como funciona por dentro

```
public/          página (index.html, app.js, styles.css) e painel (admin.html)
public/shared/   validação usada pela página e pelo servidor (mesmas regras)
server.js        servidor e rotas da API
lib/orchestrator.js  etapas do cadastro, depósitos e dados do painel
adapters/        integrações: *.mock.js (simulado) e *.real.js (a fazer)
lib/store.js     dados em data/db.json (trocar por banco antes de produção)
config.js        clube, agente, WhatsApp, valores de depósito, links, torneios
```

Etapas de cada cadastro:

- **Conta** (no cadastro): conta na Suprema → e-mail confirmado.
- **PIX** (no 1º depósito): conta no Fichas 24h → ID da Suprema vinculado.
- **Clube**: pelo link oficial de convite (`links.clubInvite` em `config.js`). Se o link parar de funcionar, gere um novo no app e cole lá.

Se uma etapa falha, o sistema tenta de novo a partir dela (até 3 vezes) e depois aparece no painel com o botão **Tentar de novo**.

A senha do jogador **não vai para o arquivo**. Ela fica só na memória do servidor por até 30 minutos. Se o jogador fizer o primeiro depósito depois disso, a página pede a senha de novo junto com os dados do PIX.

## Ligar as integrações reais

1. Preencher `adapters/suprema.real.js` com as chamadas que o app da Suprema faz para criar conta e confirmar e-mail (contrato a levantar com os devs).
2. Preencher `adapters/fichas24h.real.js`. Os endereços já identificados estão listados no próprio arquivo.
3. Rodar com os modos reais:

```bash
SUPREMA_MODE=real F24H_MODE=real ADMIN_TOKEN=uma-senha-forte node server.js
```

No PowerShell:

```powershell
$env:SUPREMA_MODE="real"; $env:F24H_MODE="real"; $env:ADMIN_TOKEN="uma-senha-forte"; node server.js
```

## Tracking

Os eventos já são enviados para `window.dataLayer`: `lp_view`, `signup_start`, `signup_submit`, `signup_complete`, `payer_complete`, `deposit_pix_created`, `pix_copy`, `deposit_paid`, `club_invite_click`, `app_download_click` e `whatsapp_click`. As origens (`utm_*`, `gclid`, `fbclid`) ficam salvas no cadastro e aparecem no painel.

Para ligar o GA4 e o Pixel da Meta, defina `GA4_ID` e `META_PIXEL_ID` ao rodar o servidor.

## Antes de ir para produção

- Trocar `data/db.json` por um banco de dados e guardar a sessão do Fichas 24h criptografada.
- Pedir liberação do IP do servidor no antifraude da Suprema, do Fichas 24h e da Asaas.
- Publicar termos de uso e política de privacidade (LGPD: a página trata CPF e senha).
- Rodar com HTTPS e `ADMIN_TOKEN` definido.
