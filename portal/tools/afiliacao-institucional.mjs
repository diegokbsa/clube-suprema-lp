// Textos das páginas obrigatórias dos blogs de afiliado (AdSense/E-E-A-T): Sobre, Contato, Política de Privacidade,
// Termos de Uso, Aviso de afiliados e Equipe editorial. Um modelo só para os 10 blogs; o que muda vem do site.json
// (nome, descrição, autor, domínio, e-mail) e do medicao.json (ferramentas de análise realmente ligadas).
// Regras: nada de promessa de ganho, nenhum dado inventado (sem CNPJ, nome de pessoa ou credencial que não exista).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const PAGINAS = ['sobre', 'contato', 'privacidade', 'termos', 'aviso-de-afiliados', 'autor'];
export const ROTULO = { sobre: 'Sobre', contato: 'Contato', privacidade: 'Privacidade', termos: 'Termos de uso', 'aviso-de-afiliados': 'Aviso de afiliados', autor: 'Equipe editorial' };
const ATUALIZADA = '8 de novembro de 2026';

/** E-mail de contato do blog: o do site.json ("email") ou contato@<domínio próprio>. */
export const emailDe = (info, dominio) => info.email || `contato@${String(dominio).split('/')[0]}`;

export function institucional(pag, { info, dominio, medicao = {}, posts = [] }) {
  const nome = esc(info.nome);
  const autor = esc(info.autor || `Equipe ${info.nome}`);
  const mail = esc(emailDe(info, dominio));
  const site = esc(String(dominio).split('/')[0]);
  const ferramentas = [medicao.ga4 ? 'o Google Analytics 4' : null, medicao.clarity ? 'o Microsoft Clarity' : null].filter(Boolean);
  const T = {
    sobre: {
      titulo: `Sobre o ${info.nome}`, desc: `Quem escreve o ${info.nome}, por que o blog existe e como produzimos e revisamos cada guia.`,
      sub: info.tagline,
      html: `<p>${esc(info.sobre || info.descricao)}</p>
<h2>Por que o ${nome} existe</h2>
<p>${esc(info.descricao)} Criamos o blog porque a maior parte do que se encontra sobre o tema é promessa, lista de links ou texto copiado. Aqui a ideia é o contrário: explicar o assunto com calma, mostrar como conferir as informações por conta própria e só então, quando faz sentido, indicar um produto.</p>
<h2>Quem escreve</h2>
<p>Os guias são escritos e revisados pela ${autor}. A página <a href="/autor">Equipe editorial</a> mostra como trabalhamos, como corrigimos erros e como separamos o que é opinião do que é fato.</p>
<h2>Como ganhamos dinheiro</h2>
<p>O ${nome} pode receber comissão quando você compra um produto indicado por um link de afiliado, sem custo extra para você, e pode exibir anúncios de terceiros. A comissão não muda o que escrevemos nem a ordem dos produtos. Os detalhes estão no <a href="/aviso-de-afiliados">aviso de afiliados e publicidade</a>.</p>
<h2>Fale com a gente</h2>
<p>Dúvida, correção ou sugestão de pauta: escreva para <a href="mailto:${mail}">${mail}</a> ou veja a página de <a href="/contato">contato</a>.</p>`,
    },
    contato: {
      titulo: `Contato · ${info.nome}`, desc: `Como falar com a equipe do ${info.nome}: e-mail, prazo de resposta e o que podemos ou não resolver.`,
      sub: 'Dúvidas, correções, sugestões de pauta e pedidos sobre seus dados.',
      html: `<p>O jeito mais rápido de falar com o ${nome} é por e-mail:</p>
<p><strong><a href="mailto:${mail}">${mail}</a></strong></p>
<h2>O que você pode pedir</h2>
<ul><li><strong>Correção:</strong> viu um erro, um número desatualizado ou um link quebrado? Diga a página e o trecho. Corrigimos e anotamos a data de atualização.</li>
<li><strong>Sugestão de pauta:</strong> conte qual dúvida você gostaria de ver respondida.</li>
<li><strong>Dados pessoais (LGPD):</strong> acesso, correção ou exclusão do que você nos enviou, como o e-mail da lista de novidades. Veja a <a href="/privacidade">Política de Privacidade</a>.</li>
<li><strong>Parcerias:</strong> propostas de conteúdo patrocinado são avaliadas e, se publicadas, ficam identificadas como publicidade.</li></ul>
<h2>Prazo de resposta</h2>
<p>Respondemos em até 5 dias úteis.</p>
<h2>O que não resolvemos</h2>
<p>Somos um blog de conteúdo, não vendemos nem entregamos os produtos que indicamos. Para suporte, reembolso, acesso ou cobrança de um produto, fale com o vendedor ou com a plataforma em que você comprou (Hotmart, Kiwify, Cakto ou outra). O direito de arrependimento de 7 dias em compras online está no <a href="https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm" rel="noopener">Código de Defesa do Consumidor</a> (art. 49).</p>`,
    },
    privacidade: {
      titulo: `Política de Privacidade · ${info.nome}`, desc: `Quais dados o ${info.nome} coleta, cookies, Google Analytics, Google AdSense, seus direitos pela LGPD e como falar conosco.`,
      sub: `Atualizada em ${ATUALIZADA}.`,
      html: `<p>Esta política explica quais dados o site <strong>${site}</strong> (${nome}) coleta, para que usamos, com quem compartilhamos e como você exerce seus direitos, conforme a Lei Geral de Proteção de Dados (<a href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm" rel="noopener">Lei 13.709/2018, LGPD</a>).</p>
<h2>Quem é o responsável</h2>
<p>O responsável pelo tratamento dos dados é a equipe editorial do ${nome}. Canal para pedidos sobre dados pessoais: <a href="mailto:${mail}">${mail}</a>.</p>
<h2>Dados que coletamos</h2>
<ul><li><strong>Dados de navegação:</strong> endereço IP, tipo de aparelho e navegador, páginas visitadas, tempo de leitura e origem do acesso, coletados automaticamente por cookies e tecnologias parecidas.</li>
<li><strong>E-mail:</strong> só se você preencher o formulário de novidades, com a sua autorização. Usamos para enviar avisos de guias novos. Você sai da lista quando quiser.</li>
<li><strong>Mensagens:</strong> o que você enviar por e-mail para o contato.</li></ul>
<h2>Cookies e ferramentas de terceiros</h2>
<p>Cookies são pequenos arquivos que o navegador guarda. Usamos:</p>
<ul><li><strong>Medição de audiência:</strong> ${ferramentas.length ? `usamos ${ferramentas.join(' e ')} para entender quais guias são lidos e melhorar o conteúdo` : 'podemos usar o Google Analytics para entender quais guias são lidos e melhorar o conteúdo'}. O <strong>Google Analytics</strong> grava cookies e envia dados de uso ao Google. Saiba como o Google usa dados de sites que usam seus serviços em <a href="https://policies.google.com/technologies/partner-sites?hl=pt-BR" rel="noopener">policies.google.com/technologies/partner-sites</a>.</li>
<li><strong>Publicidade (Google AdSense):</strong> o blog pode exibir anúncios do Google AdSense. O Google e seus parceiros usam cookies, identificadores e o endereço IP para mostrar anúncios, inclusive personalizados com base nas suas visitas a este e a outros sites, e para medir resultados e evitar fraude. Você pode ver e controlar a personalização de anúncios em <a href="https://adssettings.google.com" rel="noopener">adssettings.google.com</a> e saber mais em <a href="https://policies.google.com/technologies/ads?hl=pt-BR" rel="noopener">policies.google.com/technologies/ads</a>.</li>
<li><strong>Links de afiliado:</strong> ao clicar em um link de indicação, passamos por um encurtador (l.kbsa.app) que conta o clique e leva você à página do vendedor. A plataforma de vendas (Hotmart, Kiwify, Cakto) registra a origem da compra para pagar nossa comissão e tem política de privacidade própria.</li></ul>
<p>Você pode bloquear ou apagar cookies nas configurações do navegador, mas algumas funções podem deixar de funcionar. Para recusar o Google Analytics, use o <a href="https://tools.google.com/dlpage/gaoptout?hl=pt-BR" rel="noopener">complemento oficial de desativação</a>.</p>
<h2>Para que usamos os dados</h2>
<p>Para manter o site funcionando, medir e melhorar o conteúdo, enviar o que você pediu por e-mail, exibir anúncios, conferir comissões de afiliado e cumprir obrigações legais. As bases legais são o seu consentimento, o legítimo interesse (segurança e estatísticas) e o cumprimento de obrigação legal.</p>
<h2>Com quem compartilhamos</h2>
<p>Com os provedores que fazem o site funcionar (hospedagem, medição, e-mail) e com o Google, no caso de anúncios e estatísticas. Não vendemos seus dados.</p>
<h2>Por quanto tempo guardamos</h2>
<p>Dados de navegação seguem os prazos das ferramentas de medição. O e-mail fica na lista até você pedir para sair.</p>
<h2>Seus direitos (LGPD, art. 18)</h2>
<p>Você pode pedir confirmação de que tratamos seus dados, acesso, correção, anonimização ou exclusão, portabilidade, informação sobre compartilhamento e a revogação do consentimento. Escreva para <a href="mailto:${mail}">${mail}</a>. Também é possível reclamar à <a href="https://www.gov.br/anpd/pt-br" rel="noopener">Autoridade Nacional de Proteção de Dados (ANPD)</a>.</p>
<h2>Crianças</h2>
<p>O site é voltado a maiores de 18 anos e não coleta dados de crianças de propósito.</p>
<h2>Mudanças nesta política</h2>
<p>Quando algo mudar, atualizamos esta página e a data no topo.</p>`,
    },
    termos: {
      titulo: `Termos de Uso · ${info.nome}`, desc: `Regras de uso do ${info.nome}: conteúdo informativo, links de afiliado, limites de responsabilidade e direitos autorais.`,
      sub: `Atualizados em ${ATUALIZADA}.`,
      html: `<p>Ao usar o site <strong>${site}</strong> (${nome}) você concorda com estes termos.</p>
<h2>Conteúdo informativo</h2>
<p>Os guias têm finalidade informativa e educacional. Não são aconselhamento financeiro, jurídico, contábil ou técnico individual, e não prometemos resultado de vendas, ganho ou economia. Cada caso depende de produto, preço, execução e circunstâncias. Confira informações importantes nas fontes oficiais citadas e, se for decisão relevante, consulte um profissional.</p>
<h2>Produtos e links de terceiros</h2>
<p>Indicamos produtos e serviços de terceiros. Preço, conteúdo, prazo e garantia são definidos pelo vendedor e podem mudar; confira sempre na página oficial antes de comprar. A compra é um contrato entre você e o vendedor, não conosco. Não somos responsáveis pelo site, pelo produto ou pelo atendimento de terceiros.</p>
<h2>Links de afiliado e anúncios</h2>
<p>Parte dos links é de afiliado e o blog pode exibir anúncios. Leia o <a href="/aviso-de-afiliados">aviso de afiliados e publicidade</a>.</p>
<h2>Direitos autorais</h2>
<p>Os textos, imagens e a identidade do ${nome} são protegidos. Você pode citar trechos curtos com link para o guia original. Reprodução integral ou comercial exige autorização por escrito. Se você acredita que algum conteúdo violou direitos seus, escreva para <a href="mailto:${mail}">${mail}</a> com o endereço da página.</p>
<h2>Uso adequado</h2>
<p>Não é permitido tentar derrubar o site, coletar conteúdo em massa por robôs ou usar o site para fraude ou spam.</p>
<h2>Limite de responsabilidade</h2>
<p>Fazemos o possível para manter tudo correto e atualizado, mas o conteúdo é fornecido "como está", sem garantia de que esteja livre de erros. Não respondemos por perdas decorrentes do uso das informações, na extensão permitida pela lei.</p>
<h2>Lei aplicável</h2>
<p>Estes termos seguem as leis do Brasil. Os direitos do consumidor previstos no Código de Defesa do Consumidor não são afetados.</p>
<h2>Mudanças</h2>
<p>Podemos atualizar estes termos; a data no topo mostra a versão em vigor.</p>`,
    },
    'aviso-de-afiliados': {
      titulo: `Aviso de afiliados e publicidade · ${info.nome}`, desc: `Como o ${info.nome} ganha dinheiro: comissão de links de afiliado, anúncios e como isso se relaciona com o que escrevemos.`,
      sub: 'Transparência sobre comissões e anúncios.',
      html: `<p><strong>O ${nome} ganha comissão.</strong> Quando você clica em certos links e compra o produto, a plataforma de vendas (como Hotmart, Kiwify ou Cakto) paga uma comissão ao blog. <strong>Você não paga nada a mais por isso.</strong></p>
<h2>Como identificamos</h2>
<ul><li>Links de afiliado levam o atributo <code>sponsored</code> e abrem em outra aba.</li>
<li>Todo guia que pode conter indicação termina com um aviso de comissão.</li>
<li>Caixas de oferta mostram o preço da página oficial e a data em que conferimos.</li></ul>
<h2>O que a comissão não muda</h2>
<ul><li>A ordem dos produtos: escolhemos pelo conteúdo, preço e para quem serve, não pelo valor da comissão.</li>
<li>O que escrevemos: se um produto não serve para o seu caso, dizemos.</li>
<li>Os guias: eles respondem à dúvida mesmo que você não compre nada.</li></ul>
<h2>O que comparamos</h2>
<p>Comparamos o que cada vendedor mostra na página oficial: tipo de conteúdo, preço, garantia e para quem é. Não prometemos resultado, e qualquer número de ganho que apareça numa página de venda é do vendedor, não nosso.</p>
<h2>Anúncios</h2>
<p>O blog pode exibir anúncios do Google AdSense. O Google decide o que mostrar com base no conteúdo da página e nos interesses de quem lê (veja a <a href="/privacidade">Política de Privacidade</a>). Não temos controle sobre cada anúncio exibido.</p>
<h2>Conteúdo patrocinado</h2>
<p>Se um dia publicarmos conteúdo pago por uma marca, ele virá marcado como publicidade no topo.</p>
<p>Dúvidas: <a href="mailto:${mail}">${mail}</a>.</p>`,
    },
    autor: {
      titulo: `Equipe editorial · ${info.nome}`, desc: `Quem escreve o ${info.nome}, como produzimos, revisamos e corrigimos os guias e onde buscamos as fontes.`,
      sub: `${info.autor || `Equipe ${info.nome}`}: método de trabalho, fontes e correções.`,
      html: `<p>Os guias do ${nome} são assinados pela <strong>${autor}</strong>, núcleo editorial dedicado ao tema do blog (${esc(info.categoria || info.tagline)}). Esta página mostra como o conteúdo é feito.</p>
<h2>Como produzimos</h2>
<ol><li><strong>Pauta pela dúvida real:</strong> partimos de perguntas que as pessoas fazem em buscadores e comunidades.</li>
<li><strong>Apuração:</strong> consultamos fontes oficiais e as páginas dos próprios vendedores. Regras, prazos e números vêm com link para a fonte.</li>
<li><strong>Texto próprio:</strong> escrevemos para responder a dúvida com exemplos e passos práticos, não para juntar links.</li>
<li><strong>Revisão:</strong> checamos fatos, links e se o texto não promete resultado.</li></ol>
<h2>Fontes</h2>
<p>Damos preferência a órgãos oficiais (leis, governo, reguladores), documentação dos fabricantes e plataformas e dados de mercado de origem identificada. Número que muda toda hora fica de fora ou vem com a data da conferência.</p>
<h2>Datas e atualizações</h2>
<p>Cada guia mostra a data de publicação e a de atualização. Quando uma informação muda, atualizamos o texto e a data.</p>
<h2>Correções</h2>
<p>Se encontrarmos ou recebermos um erro, corrigimos o texto no mesmo guia e registramos a atualização. Envie correções para <a href="mailto:${mail}">${mail}</a>.</p>
<h2>Independência</h2>
<p>O blog ganha comissão por alguns links e pode exibir anúncios. Isso não define o que publicamos: veja o <a href="/aviso-de-afiliados">aviso de afiliados e publicidade</a>.</p>
${posts.length ? `<h2>Guias da equipe</h2><ul>${posts.slice(0, 12).map((p) => `<li><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a></li>`).join('')}</ul>` : ''}`,
    },
  };
  return T[pag];
}
