# Referência SX (sx-co.com) — estrutura, jornada, tons e lacunas

Tarefa PA-060 · E10 Catálogo de 25 modelos · levantamento feito em 05/11/2026 (acesso direto às páginas e ao CSS público do site).
Objetivo: orientar os 5 modelos inspirados na SX **sem copiar marca, imagem, texto ou depoimento**. Tudo abaixo é observação estrutural e de estilo; qualquer frase de página foi parafraseada.

## 1. Visão geral do site deles

- Site institucional de um grupo/holding de clubes de poker, com foco **B2B**: converter dono de clube, slot e agente em parceiro.
- Público secundário: o jogador final (blog educacional e grade de torneios).
- Stack observada: site estático em Next.js servido de S3, tema escuro, fonte geométrica em tudo e fonte mono nos números.
- 8 itens de menu + 1 botão de CTA fixo na navbar; um item do menu ("Trabalhe Conosco") sai do domínio para uma plataforma de vagas externa.

### Mapa de rotas observado

| Menu | URL | Tipo |
|---|---|---|
| Início | `/` | institucional + conversão |
| Benefícios | `/beneficios` | lista de vantagens para parceiros |
| Blog | `/blog` + `/blog/<slug>` | conteúdo educacional |
| Contato | `/contato` | formulário de parceria (única conversão real do site) |
| Fichas 24H | `/fichas24h` | página do app de fichas (links de download) |
| Torneios | `/torneios` | grade diária de torneios da liga |
| Sobre Nós | `/sobre` | história, diretores, números |
| Trabalhe Conosco | externo (plataforma de vagas) | fora do site |

CTAs que se repetem em todas as páginas: botão "Seja um parceiro" na navbar e botão flutuante de WhatsApp ("Precisa de ajuda?"), ambos apontando para contato/conversa. Rodapé padrão em todas as páginas: endereço (Sorocaba/SP), e-mail de ouvidoria, telefone, navegação, badges de app (Google Play e App Store) e link para o site do app de poker parceiro no logo do rodapé.

## 2. Página por página: seções (em ordem) e jornada

### 2.1 Início `/`

Seções na ordem:

1. **Navbar**: logo + 8 links + botão de CTA ("seja parceiro").
2. **Hero**: claim de liderança ("maior grupo de poker do mundo"), subtítulo curto de união/comunidade, botão "Saiba mais" (leva ao Sobre) e mascote/personagem ao lado.
3. **Benefícios-resumo**: título convidando a ver o que oferecem + 4 cartões com ícone (atendimento 24h, app de fichas, apoio de marketing, customer success) + link "ver mais" para `/beneficios`.
4. **Prova social numérica**: contador de clubes parceiros + carrossel de logos dos clubes do grupo.
5. **Chamada institucional**: convite para se juntar ao grupo, com 3 palavras-chave de valor (atendimento, organização, agilidade).
6. **Quote do CEO**: foto do CEO + declaração de propósito (conhecer o jogador e facilitar a prática do esporte).
7. **Depoimentos**: 3 cartões com foto, nome e clube do depoente.
8. **CTA final**: bloco escuro com pergunta direta ("pronto para fazer parte?") + botão para `/contato`.
9. **Blog-resumo**: 3 posts recentes com categoria, autor, data, imagem e resumo.
10. **Rodapé** + botão flutuante de WhatsApp.

Jornada do visitante-alvo (dono de clube): entra pelo claim de liderança → vê benefícios → vê prova social (logos + depoimentos) → quote humaniza → CTA leva ao formulário. O jogador final desce até o blog.

### 2.2 Benefícios `/beneficios`

1. Hero interno com título em caixa alta convidando a conhecer os benefícios.
2. Texto de apoio curto (diferencial = atendimento + rapidez em saques/depósitos).
3. **Grade de 6 benefícios**, cada um com ícone, título em caixa alta e 1 frase: central 24h, app de fichas, saque/depósito 24h, apoio de marketing, customer success, app da liga.
4. CTA grande de fechamento ("seja parte disso") com botão para contato.
5. Rodapé padrão.

Jornada: página de reforço racional — quem clicou "ver mais" na home recebe a lista completa e um novo CTA.

### 2.3 Fichas 24H `/fichas24h`

1. Título sobre os benefícios do app.
2. Frase de acesso multiplataforma.
3. 3 botões: Web App, Google Play, App Store.
4. Rodapé padrão.

Jornada: página-ponte de download. **É a página mais rasa do site** (ver lacunas).

### 2.4 Torneios `/torneios`

1. Banner da série em destaque (nome da edição, período, garantido total).
2. **Grade do dia**: tabela com colunas INÍCIO, TORNEIO, GTD, TIPO, BUY-IN, BLINDS, STACK, LATE, horário de Brasília, com paginação por dia ("1 de 8").
3. Rodapé padrão.

Jornada: página utilitária para quem já é jogador; não há CTA para cadastro/convite a partir da grade.

### 2.5 Sobre Nós `/sobre`

1. **Time de diretores**: 3 fotos com nome e cargo.
2. **Números**: ano de fundação (2021), total de clubes parceiros (100+), clubes de origem (4, com nomes).
3. **Nossa origem**: texto de 2 parágrafos (fusão de clubes, propósito).
4. **Para o parceiro**: 3 itens com ícone (atendimento 24h, plataforma de fichas, liga).
5. Convite + contador de clubes + carrossel de logos (repete o padrão da home).
6. Rodapé padrão.

Jornada: página de confiança — quem clicou "Saiba mais" no hero recebe história, rostos e números.

### 2.6 Contato `/contato`

1. Bloco de dados de contato (endereço, e-mail, telefone).
2. **Formulário de parceria**: nome, e-mail, celular, "já trabalha com poker?" (sim/não), "se sim, qual plataforma?", botão de envio; aviso de política de privacidade.
3. Rodapé padrão.

Jornada: **única página de conversão** — todos os CTAs do site convergem aqui.

### 2.7 Blog `/blog` e posts

- Lista com cartões: categoria (ex.: MUNDO, BRASIL, TORNEIOS, TUTORIAIS), imagem, título, resumo, autor e data.
- Posts educacionais longos (ex.: o que é holding de poker, como montar um clube, guia para iniciantes, estratégia de satélites).
- Último post publicado em 12/05/2025 — blog parado há ~18 meses na data desta análise.

## 3. Paleta observada (hex extraídos do CSS público)

Tema **escuro**. Variáveis de marca definidas no CSS deles:

| Papel | Hex | Observação |
|---|---|---|
| Fundo principal | `#0f0f0f` | canvas do site |
| Superfície elevada (cards) | `#171717` | cartões e blocos |
| Superfície alternativa | `#262626` | áreas mutadas |
| Azul principal (marca) | `#39bcff` | botões, destaques |
| Azul secundário | `#00b7ff` | links/estados |
| Ciano de destaque | `#6af8ff` | acentos pontuais |
| Linha/borda azulada | `#32abbb` | separadores de marca |
| Tinta escura sobre azul | `#0f5561` | texto em cima de azul claro |
| Texto principal | `#ffffff` | |
| Texto secundário | `#a1a1a1` / `#737373` | |
| Borda neutra | `#ffffff1a` (branco 10%) | |
| Sucesso / WhatsApp | `#25d366` | botão flutuante |
| Erro | `#ff6568` | |

Forma e tipo observados:

- Raio de borda base de ~10px em cartões; botões em formato pill (25–35px).
- Fonte geral: **Montserrat** (geométrica humanista); números e grade de torneios em **Geist Mono**.
- Nota de compatibilidade: Montserrat e Geist Mono **não estão** na lista `FONTS` do portal. Equivalentes mais próximos na nossa lista: `Manrope` ou `Archivo` no lugar de Montserrat; para números, manter a fonte do tema (não há mono na lista).

## 4. Tom de voz observado

- Institucional direto com apelo de comunidade: slogan recorrente de "juntos somos mais fortes" (parafraseado).
- Superlativo de liderança ("o maior do mundo") usado como claim central, repetido no CTA final.
- Frases curtas, verbos no imperativo nos botões ("quero fazer parte", "clique aqui").
- Fala sempre com "você"; benefício antes de característica.
- Urgência leve ("não perca mais tempo") sem contagem regressiva ou escassez.
- Caixa alta em títulos de benefícios e CTAs.

## 5. Lacunas do site deles — onde podemos fazer melhor

1. **Prova social inconsistente**: o contador da home exibe "0+ clubes parceiros" (valor do contador visivelmente não carregado/inicial), enquanto a página Sobre afirma 100+. Nos nossos modelos, número só entra com dado real da operação; sem dado, usa `stats` com `"demo": true` ou omitir.
2. **Página do app de fichas quase vazia**: só 3 botões de download. Dá para fazer muito melhor: passo a passo de como depositar/sacar, FAQ, capturas ilustradas (blocos `steps`, `faq`, `features`).
3. **Grade de torneios sem conversão**: tabela do dia sem filtro por buy-in/tipo e sem CTA para jogar (link de convite/chips). Nosso bloco `schedule` pode fechar a seção com `cta` apontando para `{{chipsUrl}}`/`{{inviteLink}}`.
4. **Nenhum FAQ no site inteiro** — nem para parceiro, nem para jogador. Bloco `faq` é diferencial barato.
5. **Formulário de contato pouco qualificador**: não pergunta o perfil do lead (dono de clube × agente × jogador) nem cidade; o nosso `contact`/`lead_form` pode segmentar melhor o funil.
6. **Blog parado há ~18 meses** e sem CTA dentro dos posts para o app ou para parceria (o post de satélites é exceção, com menção ao app).
7. **"Trabalhe Conosco" quebra a jornada** saindo do domínio; e versões antigas indexadas do menu mostram um item "Eventos" que não existe mais — sinal de página despublicada sem redirecionamento.
8. **Públicos misturados**: clube, agente e jogador recebem a mesma mensagem. Nos modelos, dá para criar variação por público (página "para agentes" separada).
9. **Depoimentos sem lastro**: cartões com nome e clube, mas sem link para o clube — e, regra nossa, nada de inventar depoimento: nos modelos, esse bloco só sai com conteúdo real da operação, senão vira `features` ou `stats`.
10. **Sem página de resultados/ranking da liga** nem histórico de campeões — conteúdo que engaja jogador recorrente e não existe lá.

## 6. Como usar isto nos 5 modelos inspirados na SX

Mapeamento seção SX → bloco do portal (`BLOCKS` em `lib/blocks.mjs`):

| Seção SX | Bloco do portal |
|---|---|
| Navbar com CTA | `navbar` |
| Hero com claim + mascote | `hero` |
| 4–6 benefícios com ícone | `features` |
| Contador + logos de clubes | `stats` + `logos` |
| Quote do CEO / texto institucional | `text` |
| Depoimentos | `cards` (só com conteúdo real da operação) |
| CTA final em bloco escuro | `cta` |
| Grade diária de torneios | `schedule` |
| Formulário de parceria | `contact` / `lead_form` |
| Posts | módulo `blog` (rotas `/s/<site>/blog`) — não há bloco de lista de posts; usar `cta` para o blog |
| Aviso/disclaimer | `notice` |
| Rodapé | `footer` |

Regras de ouro para os 5 modelos:

- **Estrutura sim, cópia não**: replicar a *ordem das seções* e o *tipo de conteúdo*; jamais texto, slogan, nome de clube, foto, mascote ou depoimento da SX.
- Tema escuro com azul/ciano é a assinatura visual deles — usar como inspiração de *papel de cor* (fundo escuro + acento vibrante), não os mesmos hex em todos os 5 modelos (variar acento para diferenciar).
- Público-alvo dos modelos: dono de clube/agente (conversão em lead) + jogador (agenda e app).
- Placeholders do portal que cobrem as lacunas: `{{inviteLink}}`, `{{chipsUrl}}`, `{{whatsappLink}}`, `{{tagline}}`.
- Composição da página inicial precisa ser diferente entre os 5 (o validador recusa cópia): variar a ordem de `features`/`stats`/`logos`/`cta` e as páginas internas.

## 7. Fontes consultadas

Todas acessadas em 05/11/2026: `/`, `/beneficios`, `/fichas24h`, `/torneios`, `/sobre`, `/contato`, `/blog` (e post `/blog/satelites-melhor-amigo-players-mtt`), mais os CSS públicos do site (`/_next/static/chunks/*.css`) de onde saíram os hex e as fontes.
