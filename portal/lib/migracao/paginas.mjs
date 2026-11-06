// Páginas públicas da trilha "Migrar para o pôquer" (edição SX): candidatura em /migrar e primeiro acesso do agente.
// HTML do servidor, sem JavaScript: o formulário funciona com POST comum e volta com 303 (enviado) ou com a página e os erros.
// Pele em /assets/migrar.css. Todo texto público está em TEXTO e passa pelo preflight (teste em test/migracao.test.mjs).
import { esc } from '../block-kit.mjs';

export const CONSENTIMENTO_VERSAO = 'migrar-v1-2026-11-06';
export const MP_URL = 'https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/mpv/mpv1394.htm';

export const CANAIS_FORM = [['telegram', 'Telegram'], ['whatsapp', 'WhatsApp'], ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['outro', 'Outro']];
export const AUDIENCIAS = [['ate-1k', 'Até 1 mil pessoas'], ['1k-10k', 'De 1 mil a 10 mil'], ['10k-50k', 'De 10 mil a 50 mil'], ['50k-200k', 'De 50 mil a 200 mil'], ['200k-mais', 'Mais de 200 mil']];
export const ORIGENS = [['afiliado-bet', 'Afiliado de casa de apostas'], ['criador', 'Criador de conteúdo'], ['dono-grupo', 'Dono de grupo no Telegram ou WhatsApp'],
  ['tipster', 'Tipster (dicas de aposta)'], ['outro', 'Outro']];
export const rotulo = (lista, v) => (lista.find(([k]) => k === v) || [v, v])[1];

export const TEXTO = {
  titulo: 'Seu canal ficou sem produto.',
  tituloLinha2: 'O pôquer é outra mesa.',
  abertura: 'Desde a MP 1.394/2026, muita gente que indicava apostas esportivas no Telegram, no WhatsApp e nas redes ficou sem o que indicar. A SX trabalha com clubes de pôquer no app Suprema Poker: jogo de habilidade entre pessoas, não aposta contra a casa. Se você quer conversar sobre virar agente de um clube, deixe a sua candidatura.',
  mesa: 'Numa mesa de pôquer você joga contra as outras pessoas sentadas nela. A casa não está do outro lado.',
  antes: [
    ['É candidatura, não cadastro.', 'A equipe lê, analisa o seu canal e responde pelo contato que você deixar. Nada é publicado em seu nome.'],
    ['Sem bônus, sem ficha grátis, sem promessa.', 'O que existe é um clube organizado, um painel de agente e suporte. O resultado de cada mesa depende de quem joga.'],
    ['Só +18 e jogo responsável.', 'Para você e para o seu público. Menor de idade fica fora, sempre.'],
    ['Leitura, não decisão.', 'O texto da MP fala de apostas de quota fixa e não cita o pôquer. Isso é leitura do texto: o STF discute o tema e a MP ainda pode mudar.'],
  ],
  passos: [
    ['Você envia', 'Um minuto, uma tela só.'],
    ['A equipe analisa', 'Canal, público e se faz sentido para os dois lados.'],
    ['Se fizer sentido', 'Você recebe acesso a um painel de agente, com site em rascunho para revisar antes de qualquer publicação.'],
  ],
  consentimento: 'Autorizo a SX a usar meu nome e meu contato só para analisar esta candidatura e falar comigo sobre ela. Meus dados não são vendidos nem repassados, e posso pedir a exclusão a qualquer momento.',
  maior18: 'Tenho 18 anos ou mais.',
  rodape: 'Isto não é orientação jurídica. Somente maiores de 18 anos. Jogue com responsabilidade.',
  enviadoTitulo: 'Candidatura recebida.',
  enviadoTexto: 'A equipe da SX vai ler e falar com você pelo contato que você informou. Não mandamos mensagem automática e nada é publicado em seu nome. Somente maiores de 18 anos. Jogue com responsabilidade.',
  pausadaTitulo: 'Trilha pausada.',
  pausadaTexto: 'As regras sobre jogos on-line estão em discussão e pausamos as novas candidaturas até ter clareza. Volte em alguns dias. Somente maiores de 18 anos. Jogue com responsabilidade.',
};

/** Todo o texto público de /migrar, para o preflight. */
export const textoPublicoMigrar = () => [TEXTO.titulo, TEXTO.tituloLinha2, TEXTO.abertura, TEXTO.mesa, ...TEXTO.antes.flat(), ...TEXTO.passos.flat(),
  TEXTO.consentimento, TEXTO.maior18, TEXTO.rodape, TEXTO.enviadoTitulo, TEXTO.enviadoTexto, TEXTO.pausadaTitulo, TEXTO.pausadaTexto].join('\n\n');

export const PAGE_CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

const ICO = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  seta: '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.5 8h10M8.5 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  pausa: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 6v12M15 6v12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};

/** Mesa de 9 lugares vista de cima, em fio fino. O lugar 5 (de frente) é o de quem chega. */
function mesaSvg() {
  const lugares = [];
  for (let i = 0; i < 9; i++) {
    const a = (Math.PI * 2 * i) / 9 - Math.PI / 2;
    const x = 200 + Math.cos(a) * 176;
    const y = 110 + Math.sin(a) * 96;
    lugares.push(`<circle class="${i === 5 ? 'lugar voce' : 'lugar'}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i === 5 ? 11 : 8}"/>`);
  }
  return `<svg class="mesa" viewBox="0 0 400 220" role="img" aria-label="Mesa de pôquer com nove lugares vista de cima">
    <ellipse class="borda" cx="200" cy="110" rx="150" ry="74"/><ellipse class="feltro" cx="200" cy="110" rx="132" ry="58"/>
    <g class="cartas"><rect x="166" y="98" width="13" height="19" rx="2"/><rect x="183" y="98" width="13" height="19" rx="2"/><rect x="200" y="98" width="13" height="19" rx="2"/><rect x="217" y="98" width="13" height="19" rx="2" class="virada"/><rect x="234" y="98" width="13" height="19" rx="2" class="virada"/></g>
    ${lugares.join('')}</svg>`;
}

function shell({ title, description, body, brand = 'SX' }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="noindex">
<meta name="theme-color" content="#0b1014">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Antonio:wght@500;600;700&family=Montserrat:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/assets/migrar.css">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='4' fill='%230b1014'/%3E%3Cellipse cx='16' cy='16' rx='11' ry='7' fill='none' stroke='%2339bcff' stroke-width='2.5'/%3E%3C/svg%3E">
</head><body><a class="pular" href="#candidatura">Pular para a candidatura</a>
<header class="topo"><div class="wrap"><a class="marca" href="/migrar"><span class="marca-sinal" aria-hidden="true">${esc(brand.slice(0, 2))}</span><span>${esc(brand)}<small>Trilha migrar para o pôquer</small></span></a><span class="selo18" title="Somente maiores de 18 anos">+18</span></div></header>
${body}
<footer class="rodape"><div class="wrap"><p>${esc(TEXTO.rodape)}</p><p><a href="${esc(MP_URL)}" rel="noopener noreferrer">Texto da MP 1.394/2026 no Planalto</a></p></div></footer>
</body></html>`;
}

function opcoes(lista, atual) {
  return lista.map(([v, l]) => `<option value="${esc(v)}" ${v === atual ? 'selected' : ''}>${esc(l)}</option>`).join('');
}

function formulario(v, erros) {
  const e = (k) => (erros[k] ? `<span class="erro-campo" id="erro-${k}">${esc(erros[k])}</span>` : '');
  const inv = (k) => (erros[k] ? ` aria-invalid="true" aria-describedby="erro-${k}"` : '');
  const lista = Object.values(erros);
  return `<form class="ficha" method="post" action="/migrar" novalidate>
    <h2 id="candidatura-titulo">Candidatura</h2>
    <p class="ficha-sub">Uma tela. Os campos com * são obrigatórios.</p>
    ${lista.length ? `<div class="erros" role="alert"><strong>Confira ${lista.length === 1 ? 'o campo marcado' : `os ${lista.length} campos marcados`}.</strong></div>` : ''}
    <label class="campo">Nome *<input name="nome" autocomplete="name" maxlength="80" required value="${esc(v.nome)}"${inv('nome')}>${e('nome')}</label>
    <label class="campo">WhatsApp ou e-mail *<input name="contato" autocomplete="email" inputmode="email" maxlength="120" required placeholder="11 98765-4321 ou voce@email.com" value="${esc(v.contato)}"${inv('contato')}>${e('contato')}</label>
    <fieldset class="campo"${erros.canal ? ' aria-describedby="erro-canal"' : ''}><legend>Canal principal *</legend>
      <div class="chips">${CANAIS_FORM.map(([k, l]) => `<label class="chip"><input type="radio" name="canal" value="${k}" ${v.canal === k ? 'checked' : ''} required><span>${esc(l)}</span></label>`).join('')}</div>${e('canal')}</fieldset>
    <div class="duas">
      <label class="campo">Tamanho da audiência *<select name="audiencia" required${inv('audiencia')}><option value="">Escolha</option>${opcoes(AUDIENCIAS, v.audiencia)}</select>${e('audiencia')}</label>
      <label class="campo">De onde você vem *<select name="origem" required${inv('origem')}><option value="">Escolha</option>${opcoes(ORIGENS, v.origem)}</select>${e('origem')}</label>
    </div>
    <label class="campo">Sobre o que é o seu canal<input name="nicho" maxlength="80" placeholder="Ex.: futebol, humor, dicas de jogo" value="${esc(v.nicho)}"></label>
    <label class="marcar"><input type="checkbox" name="maior18" value="1" ${v.maior18 ? 'checked' : ''} required${inv('maior18')}><span>${esc(TEXTO.maior18)} *</span></label>${e('maior18')}
    <label class="marcar"><input type="checkbox" name="consentimento" value="1" ${v.consentimento ? 'checked' : ''} required${inv('consentimento')}><span>${esc(TEXTO.consentimento)} *</span></label>${e('consentimento')}
    <div class="hp" aria-hidden="true"><label>Não preencha este campo<input name="website" tabindex="-1" autocomplete="off"></label></div>
    <button class="enviar" type="submit">Enviar candidatura ${ICO.seta}</button>
    <p class="miudo">Somente maiores de 18 anos. Jogue com responsabilidade.</p>
  </form>`;
}

function painel(icone, titulo, texto, extra = '') {
  return `<div class="ficha ficha-estado" role="status"><span class="estado-ico">${icone}</span><h2>${esc(titulo)}</h2><p>${esc(texto)}</p>${extra}</div>`;
}

/** estado: 'form' | 'enviado' | 'pausada' | 'limite' */
export function renderMigrar({ estado = 'form', valores = {}, erros = {}, aviso = '', brand = 'SX' } = {}) {
  const v = { nome: '', contato: '', canal: '', audiencia: '', origem: '', nicho: '', maior18: false, consentimento: false, ...valores };
  const lado = estado === 'enviado' ? painel(ICO.check, TEXTO.enviadoTitulo, TEXTO.enviadoTexto, '<a class="voltar" href="/migrar">Voltar ao início</a>')
    : estado === 'pausada' ? painel(ICO.pausa, TEXTO.pausadaTitulo, TEXTO.pausadaTexto)
      : `${aviso ? `<div class="erros" role="alert"><strong>${esc(aviso)}</strong></div>` : ''}${formulario(v, erros)}`;
  const body = `<main class="wrap palco">
  <section class="conversa" aria-labelledby="titulo">
    <h1 id="titulo"><span>${esc(TEXTO.titulo)}</span> <span class="destaque">${esc(TEXTO.tituloLinha2)}</span></h1>
    <p class="abertura">${esc(TEXTO.abertura)}</p>
  </section>
  <aside class="lado" id="candidatura" aria-labelledby="candidatura-titulo">${lado}</aside>
  <section class="detalhes" aria-label="Antes de enviar e próximos passos">
    <figure class="mesa-fig">${mesaSvg()}<figcaption>${esc(TEXTO.mesa)}</figcaption></figure>
    <h2 class="sec">Antes de enviar</h2>
    <dl class="antes">${TEXTO.antes.map(([t, d]) => `<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join('')}</dl>
    <h2 class="sec">Como segue</h2>
    <ol class="passos">${TEXTO.passos.map(([t, d]) => `<li><strong>${esc(t)}</strong><span>${esc(d)}</span></li>`).join('')}</ol>
  </section>
</main>`;
  return shell({ title: 'Migrar para o pôquer · SX', description: 'Candidatura para afiliados, criadores e donos de grupo que querem virar agente de clube de pôquer. Sem bônus, sem promessa. +18.', body, brand });
}

/** Primeiro acesso do agente: criar a senha. estado: 'form' | 'feito' | 'invalido' */
export function renderPrimeiroAcesso({ estado = 'form', email = '', operacao = '', expira = '', erro = '', brand = 'SX' } = {}) {
  let lado;
  if (estado === 'invalido') lado = painel(ICO.pausa, 'Este link não vale mais.', 'Ele expirou ou já foi usado. Peça um link novo para quem mandou este.');
  else if (estado === 'feito') lado = painel(ICO.check, 'Senha criada.', 'Agora é só entrar no painel com o seu e-mail e a senha nova. O site da operação está em rascunho: nada foi publicado.', '<a class="enviar" href="/admin/">Entrar no painel</a>');
  else {
    lado = `<form class="ficha" method="post" novalidate>
      <h2 id="candidatura-titulo">Crie a sua senha</h2>
      <p class="ficha-sub">Acesso de administrador da operação <strong>${esc(operacao)}</strong>, para <strong>${esc(email)}</strong>. Este link vale até ${esc(expira)} e só funciona uma vez.</p>
      ${erro ? `<div class="erros" role="alert"><strong>${esc(erro)}</strong></div>` : ''}
      <input type="text" name="username" value="${esc(email)}" autocomplete="username" hidden>
      <label class="campo">Senha nova *<input name="senha" type="password" autocomplete="new-password" minlength="10" required></label>
      <label class="campo">Repita a senha *<input name="senha2" type="password" autocomplete="new-password" minlength="10" required></label>
      <p class="miudo">Pelo menos 10 caracteres, misturando letras e números.</p>
      <button class="enviar" type="submit">Criar senha ${ICO.seta}</button>
    </form>`;
  }
  const body = `<main class="wrap palco palco-curto"><section class="conversa"><h1 id="titulo"><span>Primeiro acesso.</span> <span class="destaque">Painel do agente.</span></h1>
    <p class="abertura">Você foi aprovado na trilha migrar para o pôquer. Crie a sua senha para entrar no painel da sua operação. Nada foi publicado e nenhuma mensagem foi enviada em seu nome.</p></section>
    <aside class="lado" id="candidatura" aria-labelledby="candidatura-titulo">${lado}</aside></main>`;
  return shell({ title: 'Primeiro acesso · SX', description: 'Criar a senha do painel do agente.', body, brand });
}
