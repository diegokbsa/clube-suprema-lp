# Product

<!-- impeccable:product-schema 1 -->

Escopo: os 10 blogs de afiliado servidos pelo Portal (páginas próprias gravadas por `tools/afiliacao-visual.mjs`). O resto do Portal (painel, hotpoker, LPs) não está coberto aqui.

## Platform

web

## Users
Brasileiros que chegam pelo Google, Instagram ou Telegram com uma dúvida prática do nicho (sublimar caneca, achar fornecedor com CNPJ, montar live no PS5, usar milhas, consertar ar-condicionado, atender no WhatsApp, usar IA no trabalho, ser afiliado sem cair em guru). Leem quase sempre no celular, no intervalo do dia, e decidem se vale comprar um curso ou um produto físico. Desconfiam de anúncio e de promessa.

## Product Purpose
Responder a dúvida com honestidade, ser o lugar que a pessoa quer abrir de novo amanhã, e só então indicar um produto com contexto (link de afiliado rastreado pelo BigLinks). Sucesso: visitas recorrentes, cliques de gente no BigLinks e vendas de afiliado. Meta da casa: 100 vendas de afiliado por dia.

## Positioning
Cada blog tem uma pessoa por trás, com nome e jeito de falar (personagem criada com IA, declarada), que compara a ficha, mostra o que conferir e diz para quem cada opção serve. Ninguém afirma ter testado. A mesma voz aparece no Instagram e no Telegram do blog.

## Operating Context
- Blogs e vozes: fornecedores.blog (Márcio), sublima.casa (Léo da Estampa), criativos.blog (Nina), ianapratica.blog (Duda), achadinhosnapratica.blog (Bia), oficinanapratica.blog (Zé), modolive.blog (Kaique), afiliadodeverdade.blog (Carla), milhas.blog (Rafa), atendefacil.blog (Gabi).
- 1 post por dia por blog, pela rotina das 6h (Codex/Kimi escrevem, Claude confere). Posts em JSON (markdown) em `conteudo/afiliacao/<blog>/posts/`.
- Produtos: cursos Hotmart/Kiwify/Cakto e itens físicos da Shopee, só com afiliação ativa; preço sempre com a data da conferência.
- Canais: newsletter (kbsa.app/inscricoes), Telegram de ofertas de cada blog, Web Story AMP por post.

## Capabilities and Constraints
- HTML estático gravado no banco do Portal; CSS inline; sem framework; CSP própria do Portal; scripts de medição injetados pelo Portal (contador sem cookie, minilytics, Cloudflare).
- PageSpeed 100 no celular e no computador, CLS < 0,05, acessibilidade AA, SEO 100 (schema Article, Breadcrumb, FAQPage, ItemList; canonical; og:image da capa).
- Links de afiliado com `rel="sponsored nofollow"`, `?src=` por página, rótulo "Publicidade" visível.
- Proibido: aposta, pôquer a dinheiro, promessa de renda, depoimento ou preço inventado, "testei".

## Brand Commitments
- Nome, domínio e voz de cada blog (tabela acima e `Suprema-360/03-PROJECTS/Active/painelafiliados-blogs/VOZES.md`).
- Regra 02 do Kbsa: ~60% valor, ~25% conversa, ~15% oferta com contexto.
- Sem cara de IA (`Suprema-360/00-SYSTEM/PADRAO-VISUAL-SEM-CARA-DE-IA.md`).

## Evidence on Hand
- Capas por post (foto editorial gerada por post, 1200x630, webp) e fotos reais dos produtos em `public/assets/afiliacao/`.
- Cerca de 15 visitas de gente por dia somando os 10 blogs (12/11/2026).
