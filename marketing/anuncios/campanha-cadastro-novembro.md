# Campanha de cadastro de novembro (R$ 50/dia)

Montada em 01/11/2026 a partir da Biblioteca de Anúncios da Meta e dos 10 anúncios de `clube-10/` (artes + `textos.md`,
gerados por `tools/imagens/anuncios_clube.py`). Fica em **rascunho** até o OK do dono: nada de "Publicar" sem ele.

## O que a Biblioteca mostrou (busca "suprema poker" e vizinhas, anúncios ativos no Brasil)

| Anunciante | Ângulo | Formato |
|---|---|---|
| 7K Poker (4 versões desde 20/10) | Contra o agente: "Cansou de depender de agente pra sacar?", "1 real é 1 real", "Sem clube, sem agente" | Vertical verde, celular, "Saiba mais" |
| Agente Kolz | "Você pode estar deixando dinheiro na mesa": bônus de cadastro, rakeback, curso grátis | Vertical neon "R$ 8,00 de bônus", página própria |
| Agente Brotherhood PKR | "Para quem joga PPP e Suprema": cartaz "PROCURA-SE" + quiz de 5 fases que libera ticket no 1º depósito | Cartaz preto e branco, página de quiz |
| Poker 24H (alissonhc91) | "Poker 24h por dia", "5 fichas grátis" | Imagem + "Enviar mensagem" |
| Heroes Zone | Criador de conteúdo mandando para o cadastro no site | Vídeo de pessoa, 55 s |
| Clube Suprema (nós) | "Como jogar na Suprema Poker?" + clube e agente | Vídeo 33 s, "Cadastre-se", poucas impressões |

O que funciona para eles e o clube cumpre de verdade: confiança no dinheiro (PIX no CPF, sem depender de terceiro),
suporte que responde, mesa sempre cheia (Liga Suprema), rapidez (2 min), app oficial e o Spin. Bônus e fichas grátis ficam
de fora porque o clube não oferece.

## Estrutura

- **Campanha:** `Cadastro · Clube Suprema · nov/26`, objetivo **Cadastros** (Leads), local de conversão **Site**,
  orçamento da campanha **R$ 50/dia** (Advantage+), sem data de término, lance automático.
- **Evento:** `Lead` (toque em "Quero jogar", que o site já dispara) enquanto não houver 50 cadastros por semana; depois,
  `CompleteRegistration`. Precisa do Pixel da conta nova instalado no site (eu instalo quando receber o ID).
  Sem Pixel, o máximo é "Tráfego → cliques no link", que traz muito clique sem querer (ver `anuncios.md`).
- **Público:** Brasil, **18+**, todos os gêneros, interesses abertos (a Meta acha o público pelo evento).
- **Posicionamentos:** manuais: Feed, Stories e Reels do Instagram e do Facebook. **Sem Audience Network e sem Messenger.**
- **Conjunto A · Confiança:** 02 PIX no CPF, 03 Suporte 24h, 04 Em 2 minutos, 09 Primeira mesa, 10 App oficial.
- **Conjunto B · Jogo:** 01 Procura-se, 05 Spin Suprema (página `/spin`), 06 Torneios, 07 Poker 24h, 08 Liga Suprema.
- **Cada anúncio:** arte quadrada no feed e vertical em Stories/Reels (mesmo anúncio, "personalizar por posicionamento"),
  texto, título e descrição de `clube-10/textos.md`, chamada **Cadastre-se**, link com `utm_content` do anúncio.
- **Identidade:** a Página do Facebook que já assina os anúncios do clube e o Instagram @supremaclub.

Depois de 3 a 4 dias: pausar os 3 anúncios com custo por cadastro mais alto e passar o orçamento para os melhores.

## O que só o dono faz (conta nova numa BM limpa)

Criar portfólio, conta de anúncios e forma de pagamento é login e cadastro na conta do dono:

1. **Portfólio (BM):** https://business.facebook.com/overview → "Criar portfólio empresarial" → nome `Clube Suprema`.
2. **Conta de anúncios:** https://business.facebook.com/settings/ad-accounts → Adicionar → **Criar uma nova conta de anúncios**
   → nome `Clube Suprema · Cadastro`, fuso **(GMT-03:00) São Paulo**, moeda **BRL**.
3. **Pagamento:** na conta nova, Configurações de pagamento → adicionar o cartão ou PIX.
4. **Página e Instagram:** em Contas → Páginas e Contas do Instagram, adicionar a Página que assina os anúncios e o @supremaclub.
5. **Pixel:** https://business.facebook.com/events_manager → Conectar dados → Web → nome `Clube Suprema`, site `https://suprema.blog`
   → mandar o número do Pixel para eu instalar no site.

Com isso pronto, eu monto a campanha inteira em rascunho no Gerenciador de Anúncios e paro antes de publicar.

## Riscos (para decidir sabendo)

- A Meta trata poker valendo dinheiro como **jogo de azar**: anúncio pode ser reprovado e a conta restringida sem a
  autorização prévia de jogos de azar online da Meta. Os textos evitam promessa de ganho e bônus e levam o 18+.
- Criar portfólio novo para escapar de uma restrição (o portfólio antigo está restrito desde 09/09/2026) pode ser lido
  pela Meta como **burlar a restrição**, e aí ela costuma derrubar também o portfólio novo e as contas ligadas a ele.
  Por isso a conta nova precisa ser montada do zero, com pagamento próprio, e sem ligar nada do portfólio restrito.
