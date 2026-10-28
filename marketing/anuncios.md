# Anúncios do Instagram: o que ajustar

Escrito em 27/10/2026 depois das gravações do Clarity: com o site acordado a página abre em 1 a 2,4 s, mas quase todo mundo
volta para o Instagram em cerca de 1 s, sem rolar e sem clicar (89% não passam da primeira tela). Isso é típico de clique sem
querer ou de anúncio que promete uma coisa e a página mostra outra. Os passos abaixo atacam as duas coisas.

## 1. Criar o Pixel da Meta (você faz, 5 minutos)

1. Abra o **Gerenciador de Eventos** (business.facebook.com/events_manager) com a conta que paga os anúncios.
2. **Conectar fontes de dados → Web → Pixel da Meta**. Nome: `Clube Suprema`. Site: `https://suprema.blog`.
3. Escolha **instalar o código manualmente** e copie só o **ID do pixel** (um número de 15 ou 16 dígitos).
4. Me mande o número. Eu coloco o Pixel no topo da página (igual ao Clarity, para contar quem sai em 1 s) e ligo os eventos
   que o site já tem prontos: `Lead` quando a pessoa toca em "Quero jogar", `CompleteRegistration` no cadastro e `Purchase`
   no depósito.

Também vale verificar o domínio, para a Meta confiar nos eventos: **Configurações do negócio → Segurança da marca → Domínios →
Adicionar → suprema.blog → opção Meta-tag**. Me mande a linha `<meta name="facebook-domain-verification" ...>` e eu publico.
(Pelo DNS também funciona, mas o GoDaddy pede o código por SMS.)

## 2. Trocar a otimização da campanha (depois do Pixel)

Hoje a campanha provavelmente está em **cliques no link**: a Meta procura quem clica muito, inclusive sem querer.

- No conjunto de anúncios: **Meta de desempenho → Maximizar o número de visualizações da página de destino**. Só conta quando a
  página abre de verdade (precisa do Pixel).
- **Posicionamentos:** tire a **Audience Network (Rede de Público)**. É onde mais acontece clique acidental. Feed, Stories e
  Reels do Instagram e do Facebook ficam.
- Quando o Pixel juntar uns 50 `Lead` por semana, crie uma campanha com objetivo **Cadastros** e evento de conversão `Lead`.

## 3. Testar as três versões da página

O site tem três primeiras telas. Duplique o anúncio duas vezes e troque só o link:

| Versão | Link do anúncio |
|---|---|
| Padrão (celular com o app) | `https://suprema.blog/?utm_source=ig&utm_medium=paid&utm_campaign=clube&utm_content=padrao` |
| Ficha 3D | `https://suprema.blog/fichas?utm_source=ig&utm_medium=paid&utm_campaign=clube&utm_content=fichas` |
| Spin Suprema | `https://suprema.blog/spin?utm_source=ig&utm_medium=paid&utm_campaign=clube&utm_content=spin` |

Deixe rodar 3 ou 4 dias com o mesmo orçamento. A versão vencedora é a que tem mais toques em "Quero jogar" por visita.
No Clarity, filtre por **Tags → variante** (`padrao`, `fichas`, `spin`); no GA4, pelo parâmetro `variant` do evento `lp_view`.
Quem criou o anúncio com o Spin no criativo deve mandar para `/spin`, e quem mostra fichas, para `/fichas`: a página precisa
repetir o que a pessoa acabou de ver.

## 4. Remarketing (anunciar de novo para quem já viu)

- **Já dá para fazer, sem Pixel:** Públicos → Criar público → Público personalizado → **Conta do Instagram** → "Todos que
  interagiram com sua conta profissional" nos últimos 30 dias. Use num conjunto de anúncios separado, com orçamento pequeno.
- **Com o Pixel:** Público personalizado → **Site** → "Todos os visitantes" dos últimos 30 dias, excluindo quem fez `Lead`.
  Quem entrou e saiu em 1 s não te conhece ainda: no remarketing, o criativo pode explicar o que é o clube.
- Depois de uns 100 cadastros: **Público semelhante (Lookalike)** de quem fez `Lead`, Brasil, 1%.

## 5. Antes de religar ou aumentar o orçamento

- O site não dorme mais (o servidor se visita a cada 10 min, ver `docs/colocar-no-ar.md`).
- A primeira tela nova do celular (app visível, promessa e um botão só) está esperando o seu OK.
- A Meta trata poker valendo dinheiro como jogo de azar e pode pedir autorização prévia ou reprovar anúncios. Se algum anúncio
  for reprovado ou a conta receber aviso, o motivo provável é esse.
