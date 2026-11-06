/* Hot Poker — as 20 peças do primeiro enxoval.
   Cada peça é uma composição própria (posições, papéis e tamanhos), sobre o CSS comum de base.css.
   Abrir: feed.html?id=f01-boas-vindas · story.html?id=s01-salve-os-numeros · quadrado.html?id=q01-anota-ai
   Regras: nada de promessa de ganho, promoção de fichas ou depoimento; grade sempre rotulada como EXEMPLO;
   toda peça leva chama + HOT POKER, "+18 · Jogue com responsabilidade" e hotpoker.club. */

const NAIPE = { s: '♠', h: '♥', d: '♦', c: '♣' };
function carta(t) {
  if (t === 'x') return '<span class="carta costas"></span>';
  const marcada = t.endsWith('*'); if (marcada) t = t.slice(0, -1);
  const n = t.slice(-1), r = t.slice(0, -1), v = n === 'h' || n === 'd';
  return `<span class="carta${v ? ' v' : ''}${marcada ? ' marcada' : ''}"><b>${r}</b><i>${NAIPE[n]}︎</i></span>`;
}
const mao = (s, c, st = '') => `<span class="mao" style="--c:${c}px;${st}">${s.split(' ').map(carta).join('')}</span>`;
const svgChama = (st = '') => `<svg viewBox="0 0 186 250" aria-hidden="true" style="${st}"><use href="#chama"/></svg>`;
const marca = (px, cor = 'pa') => `<span class="marca le ${cor}" style="font-size:${px}px">${svgChama()}Hot Poker</span>`;
const trava = (px, cor = 'pa') => `<span class="trava le ${cor}" style="font-size:${px}px"><span class="t1">Hot</span>${svgChama()}<span class="t2">Poker</span></span>`;
const raio = (st, cor = '#ef6b1b') => `<svg class="raio" viewBox="0 0 240 900" fill="${cor}" stroke="${cor}" filter="url(#tinta-borda)" aria-hidden="true" style="${st}"><use href="#raio"/></svg>`;
const resto = (st) => `<span class="resto ra" style="${st}"></span>`;
const ICO = {
  ig: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><circle cx="12" cy="12" r="3.8"/><path d="M17 7h.01" stroke-width="3"/>',
  fb: '<path d="M14.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H9v3h2.5V21"/>',
  wa: '<path d="M4.5 19.5l1.2-3.6A8 8 0 1 1 8.6 18.6z"/><path d="M9.2 9.3c.3 2.3 2.1 4.2 4.5 4.6l1.1-1.1 1.7.8-.3 1.6c-3.6.2-7.3-3.4-7.3-7l1.6-.3.8 1.7z" stroke-width="1.5"/>',
  dir: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  baixo: '<path d="M12 4v15M6 13l6 6 6-6"/>',
  entra: '<path d="M21 4v16"/><path d="M3 12h13M11 6l6 6-6 6"/>',
  sai: '<path d="M3 4v16"/><path d="M7 12h13M15 6l6 6-6 6"/>',
};
const ico = (k, px, st = '') => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" style="width:${px}px;height:${px}px;${st}">${ICO[k]}</svg>`;

/* rodapé: v = muro | papel | laranja; pos = posição (stories: bottom:250px para ficar na margem segura) */
function rod({ v = 'muro', pos = 'bottom:36px', num = true, url = true, fundo = '' } = {}) {
  const f = v === 'papel' ? `<span class="rod-fundo cartaz rc" style="padding:0;${fundo}"></span>`
          : v === 'laranja' ? `<span class="rod-fundo cartaz laranja rc" style="padding:0;${fundo}"></span>` : '';
  const m = v === 'muro' ? marca(40, 'pa') : marca(40, 'ti');
  return `<footer class="rod rod-${v}" style="${pos}">${f}${m}${url ? '<span class="url min">hotpoker.club</span>' : '<span></span>'}`
    + `<p class="linha18"><span><b class="${v === 'muro' ? 'lc' : 'lj'}">+18</b> · Jogue com responsabilidade</span>${num ? '<span class="num">Clube 33548 · Agente 768286</span>' : ''}</p></footer>`;
}
const ROD_STORY = 'bottom:252px';

const P = {};

/* =====================================================================
   FEED 1080×1350
   ===================================================================== */

/* F01 — boas-vindas de lançamento do hotpoker.club */
P['f01-boas-vindas'] = { fmt: 'feed', html: `
${resto('right:-60px;top:90px;width:280px;height:560px;--g:2deg')}
<div class="cartaz rb" style="left:44px;top:50px;width:992px;--g:-1deg;padding:22px 22px 60px;--rx:-80px;overflow:hidden">
  ${raio('right:24px;top:-40px;height:920px;z-index:1')}
  <div class="chapa" style="padding:42px 44px 42px">
    <div class="em">${trava(160)}</div>
    <p class="an pa em" style="font-size:54px;margin-top:28px">Clube de poker no <span class="lc">Suprema Poker</span></p>
  </div>
  <p class="an em" style="font-size:104px;margin:30px 20px 0">Chegou o<br>Hot Poker.</p>
</div>
<div class="cartaz laranja rc" style="left:420px;top:878px;width:620px;--g:2deg;padding:52px 40px 38px;--rx:-200px">
  <p class="co" style="font-size:36px">O site está no ar</p>
  <p class="an min" style="font-size:96px;margin-top:8px">hotpoker.club</p>
  <p class="tx" style="font-size:32px;margin-top:14px">Fichas por PIX. Suporte humano 24h.</p>
</div>
${rod()}` };

/* F02 — como entrar no clube em 3 passos (faixas empilhadas) */
const passoFaixa = (n, h3, t, st, laranja, numCor) => `
<div class="cartaz ${laranja ? 'laranja rc' : 'rb'}" style="${st};padding:${laranja ? '50px 40px 34px' : '30px 40px 52px'};display:grid;grid-template-columns:150px 1fr;gap:0 26px;align-items:center">
  <span class="an ${numCor}" style="font-size:190px;line-height:.8">${n}</span>
  <div><p class="an" style="font-size:58px;text-wrap:balance">${h3}</p><p class="tx" style="font-size:34px;margin-top:10px">${t}</p></div>
</div>`;
P['f02-como-entrar'] = { fmt: 'feed', html: `
${svgChama('position:absolute;right:70px;top:66px;width:150px;height:202px')}
<div class="cartaz rb" style="left:40px;top:46px;width:740px;--g:-1.2deg;padding:34px 40px 56px">
  <p class="an" style="font-size:94px">Como entrar<br>no clube</p>
  <p class="co lj" style="font-size:40px;margin-top:12px">Três passos, nessa ordem</p>
</div>
${passoFaixa(1, 'Deixe seu e-mail', 'Em hotpoker.club. Chega o passo a passo com o link do clube.', 'left:40px;top:372px;width:930px;--g:.7deg', false, 'lj')}
${passoFaixa(2, 'Baixe o Suprema Poker e abra pelo link', 'O link já cai no clube 33548, com o agente 768286.', 'left:110px;top:630px;width:930px;--g:-1deg', true, 'ti')}
${passoFaixa(3, 'Compre fichas por PIX', 'No canal de fichas. Na 1ª compra: seu ID de jogador, o clube e o agente.', 'left:50px;top:912px;width:940px;--g:.5deg', false, 'lj')}
${rod()}` };

/* F03 — PIX nos dois sentidos: fichas no canal de fichas, saque no CPF */
P['f03-pix-dois-sentidos'] = { fmt: 'feed', html: `
<div class="cartaz laranja rb" style="left:40px;top:50px;width:1000px;--g:-.6deg;padding:48px 52px 66px;overflow:hidden">
  ${raio('right:-30px;top:-40px;height:1040px;opacity:.14;z-index:1', '#141414')}
  <div class="em">
    <p class="an" style="font-size:140px">PIX nos<br>dois sentidos.</p>
    <ol class="lista" style="margin-top:30px">
      <li style="display:grid;grid-template-columns:120px 1fr;gap:0 26px;align-items:center;padding:24px 0">
        ${ico('entra', 110, 'stroke-width:2.6')}
        <div><p class="an" style="font-size:82px">Entra</p><p class="tx" style="margin-top:6px">Fichas por PIX no canal de fichas, o Fichas 24h.</p></div></li>
      <li style="display:grid;grid-template-columns:120px 1fr;gap:0 26px;align-items:center;padding:24px 0">
        ${ico('sai', 110, 'stroke-width:2.6')}
        <div><p class="an" style="font-size:82px">Sai</p><p class="tx" style="margin-top:6px">Saque por PIX, na chave do seu próprio CPF. Conta no seu nome.</p></div></li>
    </ol>
  </div>
</div>
<div class="cartaz rc" style="left:520px;top:972px;width:510px;--g:2.6deg;padding:48px 40px 32px">
  <p class="an" style="font-size:50px">Defina seu limite<br><span class="lj">antes de comprar.</span></p>
</div>
${rod()}` };

/* F04 — Texas Hold'em vs Omaha para iniciante */
P['f04-texas-vs-omaha'] = { fmt: 'feed', html: `
<div class="cartaz rb" style="left:40px;top:44px;width:1000px;--g:-.8deg;padding:44px 48px 62px;display:grid;grid-template-columns:1fr auto;gap:0 34px;align-items:center">
  <div>
    <p class="an" style="font-size:122px">Texas<br>Hold'em</p>
    <p class="co lj" style="font-size:46px;margin-top:8px">NLH · no limit</p>
    <p class="tx" style="margin-top:16px">2 cartas na mão e 5 na mesa. A aposta pode ir até todas as fichas que você tem na frente.</p>
  </div>
  <div style="display:flex;gap:0">${carta('A' + 's').replace('class="carta"', 'class="carta" style="--c:150px;transform:rotate(-7deg)"')}${carta('Kh').replace('class="carta v"', 'class="carta v" style="--c:150px;transform:rotate(6deg) translate(-14px,18px)"')}</div>
</div>
<div class="cartaz laranja rc" style="left:40px;top:604px;width:1000px;--g:.9deg;padding:62px 48px 46px;display:grid;grid-template-columns:auto 1fr;gap:0 40px;align-items:center">
  <div style="display:flex;padding-left:10px">
    ${['Qs', 'Jh', '9d', '8c'].map((t, i) => carta(t).replace(/class="carta( v)?/, m => `${m} canto`).replace(/class="carta( v)? canto"/, m => `${m} style="--c:126px;margin-left:${i ? -56 : 0}px;transform:rotate(${-12 + i * 8}deg) translateY(${[14, 0, 0, 14][i]}px)"`)).join('')}
  </div>
  <div>
    <p class="an" style="font-size:130px">Omaha</p>
    <p class="co" style="font-size:46px;margin-top:6px">PLO · pot limit</p>
    <p class="tx" style="margin-top:16px">4 cartas na mão, e você usa exatamente 2. A aposta vai até o tamanho do pote.</p>
  </div>
</div>
<div style="position:absolute;left:850px;top:520px;width:150px;height:150px;border-radius:50%;background:var(--tinta);display:grid;place-items:center;transform:rotate(-8deg);border:6px solid var(--laranja)">
  <span class="an lc" style="font-size:70px">VS</span></div>
<p class="co gz" style="position:absolute;left:48px;top:1112px;font-size:34px">Começando agora? O Texas é o mais simples.</p>
${rod()}` };

/* F05 — ranking de mãos */
const RANK = [
  ['Royal flush', 'As Ks Qs Js 10s'], ['Straight flush', '5h 6h 7h 8h 9h'], ['Quadra', '9s 9h 9d 9c Kd'],
  ['Full house', 'Ks Kh Kd 7c 7s'], ['Flush', '2d 6d 9d Jd Kd'], ['Sequência', '5c 6d 7s 8h 9c'],
  ['Trinca', 'Qh Qs Qd 4c 2s'], ['Dois pares', 'Jc Jd 5s 5h As'], ['Par', '10h 10c Ks 6d 3c'], ['Carta alta', 'Ad Js 8c 4h 2s'],
];
P['f05-ranking-de-maos'] = { fmt: 'feed', html: `
<div class="cartaz preto rb" style="left:40px;top:38px;width:1000px;--g:-.7deg;padding:34px 44px 54px">
  <p class="an pa" style="font-size:118px">Ranking de mãos</p>
  <p class="co lc" style="font-size:38px;margin-top:10px">Da mais forte para a mais fraca</p>
</div>
<div class="cartaz rc" style="left:40px;top:262px;width:1000px;--g:.4deg;padding:52px 40px 30px">
  <ol class="lista">
    ${RANK.map(([n, m], i) => `<li style="display:grid;grid-template-columns:70px 1fr auto;align-items:center;gap:0 18px;padding:6px 0">
      <span class="an lj" style="font-size:50px">${i + 1}</span><span class="an" style="font-size:50px">${n}</span>${mao(m, 46)}</li>`).join('')}
  </ol>
</div>
${rod()}` };

/* F06 — grade de torneios (EXEMPLO) */
const GRADE = [['19h', 'Aquecimento', "Texas Hold'em (NLH)"], ['20h30', 'Noite do Omaha', 'Omaha (PLO)'], ['22h', 'Principal da noite', "Texas Hold'em (NLH)"], ['0h', 'Turbo da madrugada', 'NLH, blinds subindo rápido']];
P['f06-grade-exemplo'] = { fmt: 'feed', html: `
${resto('right:-40px;top:1080px;width:260px;height:140px;--g:-2deg')}
<div class="cartaz rb" style="left:40px;top:46px;width:1000px;--g:-.5deg;padding:48px 48px 66px">
  <span class="carimbo" style="right:56px;top:70px;--g:-8deg;font-size:70px">Exemplo</span>
  <p class="an" style="font-size:128px">Uma noite<br>no clube</p>
  <p class="co lj" style="font-size:44px;margin-top:12px">Grade de exemplo · ilustração</p>
  <p class="tx" style="font-size:32px;margin-top:18px;max-width:30ch">Horários e valores reais aparecem dentro do app, no clube.</p>
  <ol class="lista" style="margin-top:26px">
    ${GRADE.map(([h, n, j]) => `<li style="display:grid;grid-template-columns:250px 1fr;align-items:center;gap:0 22px;padding:16px 0 14px">
      <span class="an lj" style="font-size:100px">${h}</span><span><span class="an" style="display:block;font-size:60px">${n}</span><span class="co" style="display:block;font-size:34px;margin-top:6px">${j}</span></span></li>`).join('')}
  </ol>
</div>
${rod()}` };

/* F07 — segurança: o site não pede senha nem documento */
P['f07-sem-senha'] = { fmt: 'feed', html: `
<div class="cartaz laranja rb" style="left:34px;top:58px;width:760px;--g:-2.2deg;padding:40px 48px 62px">
  <p class="an" style="font-size:210px">Sem<br>senha.</p>
</div>
<div class="cartaz preto rc" style="left:250px;top:528px;width:790px;--g:1.6deg;padding:60px 50px 46px">
  <p class="an pa" style="font-size:140px">Sem<br><span class="lc">documento.</span></p>
</div>
<div class="cartaz rc" style="left:56px;top:880px;width:966px;--g:-.6deg;padding:58px 44px 40px;display:grid;grid-template-columns:350px 1fr;gap:0 34px;align-items:center">
  <div>
    <p class="co" style="font-size:30px">Senha do app</p>
    <div style="position:relative;margin-top:8px;border:5px solid var(--tinta);background:var(--papel-claro);padding:6px 18px;font:700 56px/1.2 Barlow, sans-serif;letter-spacing:.06em">●●●●●●●
      <span style="position:absolute;left:-14px;right:-14px;top:44%;height:12px;background:var(--tinta-laranja);transform:rotate(-9deg)"></span></div>
  </div>
  <p class="tx" style="font-size:34px">No hotpoker.club você deixa <b>só o e-mail</b>. Se alguém pedir a senha do seu app, não passe.</p>
</div>
${rod()}` };

/* F08 — chamada para o grupo do Facebook e o Instagram (cartaz com tirinhas) */
const TIRAS = [['Instagram', '@hotpoker.agent'], ['Grupo no', 'Facebook'], ['Site', 'hotpoker.club']];
P['f08-redes'] = { fmt: 'feed', html: `
${resto('left:-40px;top:880px;width:200px;height:300px;--g:-2deg')}
<div style="position:absolute;left:50px;top:46px;width:980px;transform:rotate(.6deg)">
  <div class="cartaz rc" style="position:relative;padding:70px 50px 38px;border-bottom:3px dashed rgba(20,20,20,.5)">
    <p class="an" style="font-size:136px">Segue o muro.</p>
    <p class="tx" style="font-size:38px;margin-top:20px">Dicas de mesa, glossário e os avisos do clube, no Instagram e no grupo do Facebook.</p>
    <ul class="lista" style="margin-top:28px;list-style:none">
      <li style="display:flex;align-items:center;gap:26px;padding:16px 0">${ico('ig', 86, 'stroke-width:2')}<span class="an min" style="font-size:88px">@hotpoker.agent</span></li>
      <li style="display:flex;align-items:center;gap:26px;padding:16px 0">${ico('fb', 86, 'stroke-width:2')}<span class="an" style="font-size:84px">Grupo no Facebook</span></li>
    </ul>
  </div>
  <ul class="tiras" style="position:relative;grid-template-columns:repeat(6,1fr);padding:0 14px">
    ${[0, 1, 2, 0, 1, 2].map((k, i) => `<li style="height:${[352, 342, 356, 344, 354, 340][i]}px"><span><small class="co" style="font-size:26px">${TIRAS[k][0]}</small><b class="an ${k === 0 ? 'lj min' : k === 2 ? 'min' : ''}" style="font-size:40px">${TIRAS[k][1]}</b></span></li>`).join('')}
  </ul>
</div>
${rod()}` };

/* =====================================================================
   STORIES / REELS 1080×1920 — margem segura: nada essencial em 0–250 e 1670–1920
   ===================================================================== */

/* S01 — salve esses números */
P['s01-salve-os-numeros'] = { fmt: 'story', html: `
${raio('left:760px;top:-120px;height:520px;opacity:.85')}
${resto('left:-60px;top:1560px;width:420px;height:300px;--g:3deg')}
<div class="cartaz ra" style="left:40px;top:292px;width:1000px;--g:-1deg;padding:62px 50px 64px">
  <p class="an" style="font-size:122px">Salve esses<br>números</p>
  <div style="border-top:6px solid var(--tinta);margin-top:28px;padding-top:22px">
    <p class="co" style="font-size:54px">Clube</p>
    <p class="an lj" style="font-size:258px;line-height:.86">33548</p>
  </div>
  <div style="border-top:4px solid var(--tinta);margin-top:24px;padding-top:22px">
    <p class="co" style="font-size:54px">Agente</p>
    <p class="an" style="font-size:236px;line-height:.86">768286</p>
  </div>
</div>
<div class="cartaz laranja rc" style="left:130px;top:1262px;width:900px;--g:1.8deg;padding:56px 44px 40px">
  <p class="an" style="font-size:78px">Tire print desta tela.</p>
  <p class="tx" style="font-size:34px;margin-top:12px">Você usa os dois na primeira compra de fichas, junto com seu ID de jogador.</p>
</div>
${rod({ pos: ROD_STORY })}` };

/* S02 — suporte humano 24h no WhatsApp */
P['s02-suporte-24h'] = { fmt: 'story', html: `
<div class="cartaz preto rb" style="left:40px;top:262px;width:1000px;--g:-1deg;padding:40px 50px 72px;overflow:hidden">
  ${raio('right:40px;top:120px;height:640px;z-index:1;opacity:.9')}
  <div class="em">${marca(50)}</div>
  <p class="an lc em" style="font-size:440px;line-height:.82;margin-top:34px">24h</p>
  <p class="an pa em" style="font-size:96px;margin-top:18px">Suporte humano<br>no WhatsApp</p>
</div>
<div class="cartaz rc" style="left:80px;top:1010px;width:940px;--g:1.4deg;padding:60px 46px 44px">
  <p class="co lj" style="display:flex;align-items:center;gap:14px;font-size:36px">${ico('wa', 46, 'stroke-width:2.2')}A mensagem já vai pronta:</p>
  <p style="margin-top:16px;background:var(--papel-claro);border:4px solid var(--tinta);border-radius:30px 30px 30px 0;padding:24px 30px;font:600 42px/1.25 Barlow, sans-serif">Oi! Venho do clube 33548, agente 768286, e gostaria de suporte.</p>
  <p class="an" style="font-size:66px;margin-top:30px">Do outro lado, uma pessoa.<br><span class="lj">A qualquer hora.</span></p>
</div>
${rod({ pos: ROD_STORY })}` };

/* S03 — jogo responsável: limite antes de sentar */
P['s03-limite-antes-de-sentar'] = { fmt: 'story', html: `
<div class="cartaz preto rb" style="left:40px;top:262px;width:1000px;--g:.8deg;padding:54px 54px 80px">
  <div style="display:flex;align-items:center;justify-content:space-between">
    <span class="selo18 lc" style="width:150px;height:150px;font-size:62px;border-width:7px">+18</span>${marca(44)}
  </div>
  <p class="an pa" style="font-size:134px;margin-top:34px">Antes de<br>sentar,<br><span class="lc">decida:</span></p>
  <ul class="regras pa" style="margin-top:42px;font:600 46px/1.22 Barlow, sans-serif">
    <li>Quanto vai gastar na noite.</li>
    <li>A hora de parar.</li>
    <li>Perdeu? Não jogue para recuperar.</li>
    <li>Conta, aluguel e comida ficam fora da mesa.</li>
  </ul>
</div>
<div class="cartaz laranja rc" style="left:300px;top:1336px;width:730px;--g:-2deg;padding:50px 40px 34px">
  <p class="an" style="font-size:62px">Poker é jogo.<br>Não é investimento.</p>
</div>
${rod({ pos: ROD_STORY, num: false })}` };

/* S04 — como entrar em 3 passos (vertical, números no muro e o raio atravessando) */
const passoNota = (h3, t, st, laranja) => `
<div class="cartaz ${laranja ? 'laranja rc' : 'rb'}" style="${st};padding:${laranja ? '52px 40px 40px' : '38px 40px 54px'}">
  <p class="an" style="font-size:62px;text-wrap:balance">${h3}</p><p class="tx" style="font-size:34px;margin-top:10px">${t}</p></div>`;
P['s04-como-entrar'] = { fmt: 'story', html: `
${raio('left:330px;top:440px;height:1130px;width:301px;opacity:.95')}
<div class="cartaz rb" style="left:40px;top:262px;width:860px;--g:-1.5deg;padding:42px 44px 60px">
  <p class="an" style="font-size:128px">3 passos<br>até a mesa</p>
</div>
<span class="an lc" style="position:absolute;left:58px;top:640px;font-size:320px">1</span>
${passoNota('Deixe o e-mail', 'Em hotpoker.club. O passo a passo chega com o link do clube.', 'left:262px;top:672px;width:770px;--g:1deg')}
<span class="an gz" style="position:absolute;left:872px;top:930px;font-size:320px">2</span>
${passoNota('Baixe o Suprema Poker e abra pelo link', 'Você já cai no clube 33548, com o agente 768286.', 'left:46px;top:952px;width:790px;--g:-1.2deg', true)}
<span class="an lc" style="position:absolute;left:58px;top:1262px;font-size:320px">3</span>
${passoNota('Compre fichas por PIX', 'No canal de fichas. Na 1ª compra: seu ID de jogador, o clube e o agente.', 'left:262px;top:1284px;width:770px;--g:.8deg')}
${rod({ pos: ROD_STORY })}` };

/* S05 — enquete: Texas ou Omaha? (a figurinha de enquete entra por cima, na faixa indicada) */
P['s05-enquete-texas-omaha'] = { fmt: 'story', html: `
<div class="cartaz preto ra" style="left:40px;top:262px;width:1000px;--g:-.8deg;padding:62px 50px 72px">
  ${marca(44)}
  <p class="an pa" style="font-size:128px;margin-top:28px">Você é de Texas<br>ou de <span class="lc">Omaha?</span></p>
</div>
<div class="cartaz rb" style="left:60px;top:736px;width:960px;--g:1.2deg;padding:40px 46px 58px;display:grid;grid-template-columns:1fr auto;align-items:center">
  <div><p class="an lj" style="font-size:150px">Texas</p><p class="co" style="font-size:42px;margin-top:8px">2 cartas na mão</p></div>
  ${mao('As Kh', 136)}
</div>
<div class="cartaz laranja rc" style="left:60px;top:1046px;width:960px;--g:-1deg;padding:58px 46px 40px;display:grid;grid-template-columns:1fr auto;align-items:center">
  <div><p class="an" style="font-size:150px">Omaha</p><p class="co" style="font-size:42px;margin-top:8px">4 cartas na mão</p></div>
  <div style="display:flex">${['Qs', 'Jh', '9d', '8c'].map((t, i) => carta(t).replace(/class="carta( v)?/, m => `${m} canto`).replace(/class="carta( v)? canto"/, m => `${m} style="--c:120px;margin-left:${i ? -56 : 0}px;transform:rotate(${-10 + i * 7}deg)"`)).join('')}</div>
</div>
<p class="co lc" style="position:absolute;left:66px;top:1384px;display:flex;align-items:center;gap:12px;font-size:46px">Responda na enquete ${ico('baixo', 48, 'stroke-width:3')}</p>
${rod({ pos: ROD_STORY })}` };

/* S06 — hotpoker.club no ar (lançamento, com espaço para a figurinha de link) */
P['s06-site-no-ar'] = { fmt: 'story', html: `
<div class="cartaz preto rb" style="left:40px;top:262px;width:1000px;--g:-1deg;padding:54px 56px 74px;overflow:hidden">
  ${raio('right:-20px;top:-30px;height:560px;z-index:1')}
  <div class="em">${trava(158)}</div>
  <p class="an pa em" style="font-size:54px;margin-top:30px">Clube de poker no <span class="lc">Suprema Poker</span></p>
</div>
<div class="cartaz laranja rc" style="left:110px;top:770px;width:910px;--g:2.4deg;padding:58px 50px 40px">
  <p class="an" style="font-size:250px;line-height:.86">No ar.</p>
</div>
<div class="cartaz rb" style="left:40px;top:1092px;width:970px;--g:-1.2deg;padding:44px 48px 58px">
  <p class="an min lj" style="font-size:146px">hotpoker.club</p>
  <p class="tx" style="margin-top:16px">Deixe o e-mail e receba o passo a passo: link do clube, clube 33548 e agente 768286.</p>
</div>
<p class="co lc" style="position:absolute;left:66px;top:1478px;display:flex;align-items:center;gap:12px;font-size:48px">Toque no link ${ico('baixo', 50, 'stroke-width:3')}</p>
${rod({ pos: ROD_STORY, url: false })}` };

/* =====================================================================
   QUADRADO 1080×1080
   ===================================================================== */

/* Q01 — anota aí: clube e agente */
P['q01-anota-ai'] = { fmt: 'quadrado', html: `
<p class="an pa" style="position:absolute;left:50px;top:42px;font-size:150px">Anota aí.</p>
${svgChama('position:absolute;right:64px;top:36px;width:128px;height:172px')}
<div class="cartaz rb" style="left:50px;top:226px;width:600px;--g:-3deg;padding:40px 44px 58px">
  <p class="co" style="font-size:48px">Clube</p>
  <p class="an lj" style="font-size:200px">33548</p>
</div>
<div class="cartaz laranja rc" style="left:410px;top:506px;width:630px;--g:2.5deg;padding:58px 44px 40px">
  <p class="co" style="font-size:48px">Agente</p>
  <p class="an" style="font-size:180px">768286</p>
</div>
<p class="tx gz" style="position:absolute;left:52px;top:600px;width:330px;font-size:32px">Você usa os dois na primeira compra de fichas, com o seu ID de jogador.</p>
${rod()}` };

/* Q02 — posições na mesa */
const ASSENTOS = [['BTN', 770, 448, 1], ['SB', 230, 448], ['BB', 86, 258], ['UTG', 230, 70], ['MP', 770, 70], ['CO', 914, 258]];
P['q02-posicoes-na-mesa'] = { fmt: 'quadrado', html: `
<div class="cartaz rb" style="left:40px;top:34px;width:680px;--g:-1.5deg;padding:30px 36px 50px">
  <p class="an" style="font-size:80px">Posições na mesa</p>
</div>
<p class="co gz" style="position:absolute;right:46px;top:66px;width:280px;text-align:right;font-size:30px">A ação gira no sentido do relógio</p>
<svg viewBox="0 0 1000 520" style="position:absolute;left:40px;top:192px;width:1000px;height:520px" aria-hidden="true">
  <ellipse cx="500" cy="260" rx="380" ry="172" fill="#141414" stroke="#ef6b1b" stroke-width="16"/>
  <ellipse cx="500" cy="260" rx="330" ry="132" fill="none" stroke="#e6e7e3" stroke-opacity=".22" stroke-width="3"/>
  <circle cx="676" cy="372" r="30" fill="#e6e7e3"/><text x="676" y="384" text-anchor="middle" font-family="Anton" font-size="34" fill="#141414">D</text>
  <text x="500" y="276" text-anchor="middle" font-family="Barlow Condensed" font-weight="700" font-size="34" letter-spacing="2" fill="#d2d3ce" fill-opacity=".55">HOT POKER · ILUSTRAÇÃO</text>
  ${ASSENTOS.map(([n, x, y, b]) => `<circle cx="${x}" cy="${y}" r="68" fill="${b ? '#ef6b1b' : '#e6e7e3'}" stroke="#141414" stroke-width="6"/><text x="${x}" y="${y + 17}" text-anchor="middle" font-family="Anton" font-size="${n.length > 2 ? 44 : 50}" fill="#141414">${n}</text>`).join('')}
</svg>
<div class="cartaz rc" style="left:40px;top:704px;width:1000px;--g:.6deg;padding:44px 40px 28px">
  <p class="tx" style="font-size:31px;line-height:1.2"><b>BTN (botão):</b> fala por último depois do flop.<br><b>SB e BB:</b> pagam os blinds antes das cartas.<br><b>UTG:</b> o primeiro a falar antes do flop.</p>
</div>
${rod()}` };

/* Q03 — as 4 falas da mesa (glossário de ações) */
const FALAS = [['Check', 'passar', 'Passa a vez sem apostar.', '', 'left:40px;top:194px;--g:-1.6deg'],
  ['Call', 'pagar', 'Paga a aposta que está na mesa.', 'laranja', 'left:556px;top:178px;--g:1.4deg'],
  ['Raise', 'aumentar', 'Aumenta a aposta da mão.', 'preto', 'left:40px;top:536px;--g:1deg'],
  ['Fold', 'largar', 'Larga as cartas e sai da mão.', '', 'left:556px;top:528px;--g:-1.2deg']];
P['q03-falas-da-mesa'] = { fmt: 'quadrado', html: `
<p class="an pa" style="position:absolute;left:46px;top:40px;font-size:112px">As 4 falas <span class="lc">da mesa</span></p>
${FALAS.map(([w, pt, d, cor, st], i) => `<div class="cartaz ${cor} ${i % 2 ? 'rc' : 'rb'}" style="${st};width:484px;padding:${i % 2 ? '50px 36px 34px' : '34px 36px 52px'}">
  <p class="an ${cor === 'preto' ? 'lc' : ''}" style="font-size:104px">${w}</p>
  <p class="co ${cor === 'preto' ? 'pa' : cor === 'laranja' ? '' : 'lj'}" style="font-size:34px;margin-top:4px">${pt}</p>
  <p class="tx ${cor === 'preto' ? 'pa' : ''}" style="font-size:32px;margin-top:8px">${d}</p></div>`).join('')}
${rod()}` };

/* Q04 — quiz: qual mão é mais forte? */
P['q04-quiz-qual-mais-forte'] = { fmt: 'quadrado', html: `
<div class="cartaz preto rb" style="left:40px;top:34px;width:1000px;--g:-1deg;padding:36px 44px 58px">
  <p class="an pa" style="font-size:104px">Qual é <span class="lc">mais forte?</span></p>
</div>
<div class="cartaz rb" style="left:60px;top:248px;width:960px;--g:.8deg;padding:32px 40px 52px;display:flex;align-items:center;gap:34px">
  <span class="an lj" style="font-size:150px;width:80px">A</span>${mao('2h 6h 9h Jh Kh', 116)}
</div>
<div class="cartaz laranja rc" style="left:60px;top:506px;width:960px;--g:-.8deg;padding:52px 40px 32px;display:flex;align-items:center;gap:34px">
  <span class="an" style="font-size:150px;width:80px">B</span>${mao('5c 6d 7s 8h 9c', 116)}
</div>
<p class="co gz" style="position:absolute;left:62px;top:790px;width:960px;font-size:42px">Comenta A ou B. <span class="lc">A resposta sai amanhã nos stories.</span></p>
${rod()}` };

/* =====================================================================
   CARROSSEL 1 — primeira compra de fichas por PIX (3 telas 1080×1350)
   O raio atravessa da tela 1 para a 2 e da 2 para a 3 (panorama).
   ===================================================================== */
P['c01-primeira-compra-1'] = { fmt: 'feed', html: `
${raio('left:880px;top:180px;height:900px')}
<div class="cartaz rb" style="left:40px;top:56px;width:1000px;--g:-1deg;padding:0 0 70px;overflow:hidden">
  <div class="chapa" style="padding:40px 50px">${marca(50)}</div>
  <div style="padding:44px 50px 0">
    <p class="an" style="font-size:150px">Sua primeira<br>compra<br>de fichas</p>
    <p class="co lj" style="font-size:62px;margin-top:18px">Por PIX, do começo ao fim</p>
  </div>
</div>
<p class="co gz" style="position:absolute;left:52px;top:900px;width:480px;font-size:40px">3 telas. Salve para a hora de comprar.</p>
<div class="cartaz laranja rc" style="left:560px;top:930px;width:420px;--g:2deg;padding:50px 40px 34px;display:flex;align-items:center;gap:18px">
  <span class="an" style="font-size:76px">Arraste</span>${ico('dir', 70, 'stroke-width:3.2')}
</div>
${rod()}` };

P['c01-primeira-compra-2'] = { fmt: 'feed', html: `
${raio('left:-200px;top:180px;height:900px')}
${raio('left:930px;top:-160px;height:820px')}
<p class="an pa" style="position:absolute;left:52px;top:54px;font-size:140px">Tenha à mão</p>
<p class="co lc" style="position:absolute;left:56px;top:196px;font-size:50px">3 informações na primeira compra</p>
<div class="cartaz laranja rb" style="left:60px;top:286px;width:960px;--g:.7deg;padding:40px 48px 66px">
  <ol class="lista">
    <li style="padding:22px 0"><p class="an" style="font-size:88px">Seu ID de jogador</p><p class="tx" style="font-size:34px;margin-top:8px">Fica no seu perfil, dentro do app Suprema Poker.</p></li>
    <li style="padding:22px 0"><p class="an" style="font-size:88px">Clube 33548</p><p class="tx" style="font-size:34px;margin-top:8px">O número do Hot Poker dentro do Suprema.</p></li>
    <li style="padding:22px 0"><p class="an" style="font-size:88px">Agente 768286</p><p class="tx" style="font-size:34px;margin-top:8px">O código do agente do clube.</p></li>
  </ol>
</div>
<div class="cartaz rc" style="left:440px;top:950px;width:590px;--g:-2deg;padding:50px 40px 34px">
  <p class="an" style="font-size:52px">No canal de fichas:<br>o <span class="lj nw">Fichas 24h</span>.</p>
</div>
${rod()}` };

P['c01-primeira-compra-3'] = { fmt: 'feed', html: `
${raio('left:-150px;top:-160px;height:820px')}
<div class="cartaz rb" style="left:40px;top:56px;width:1000px;--g:-.8deg;padding:44px 50px 64px">
  <p class="an" style="font-size:150px">Paga o PIX.<br><span class="lj">Pronto.</span></p>
  <p class="tx" style="margin-top:18px">Nas próximas compras, o caminho é o mesmo.</p>
</div>
<div class="cartaz preto ra" style="left:60px;top:506px;width:960px;--g:.9deg;padding:58px 50px 58px">
  <p class="an lc" style="font-size:72px">Saque</p>
  <p class="tx pa" style="margin-top:8px">Também por PIX, na chave do seu próprio CPF.</p>
  <hr style="border:0;border-top:3px solid #4a4a4e;margin:28px 0">
  <p class="an lc" style="font-size:72px">Travou?</p>
  <p class="tx pa" style="margin-top:8px">Suporte humano 24h no WhatsApp. A mensagem já vai pronta.</p>
</div>
<div class="cartaz laranja rc" style="left:110px;top:986px;width:880px;--g:-1.5deg;padding:48px 40px 30px">
  <p class="an" style="font-size:56px">Defina seu limite antes de comprar.</p>
</div>
${rod()}` };

/* =====================================================================
   CARROSSEL 2 — glossário: blind, flop, turn, river, all-in (3 telas 1080×1350)
   ===================================================================== */
const adesivo = (w, cor, st, i) => `<div class="cartaz ${cor} ${i % 2 ? 'rc' : 'rb'}" style="${st};padding:${i % 2 ? '40px 34px 24px' : '24px 34px 40px'}"><p class="an ${cor === 'preto' ? 'pa' : ''}" style="font-size:92px">${w}</p></div>`;
P['c02-glossario-1'] = { fmt: 'feed', html: `
<div class="cartaz laranja rb" style="left:40px;top:58px;width:1000px;--g:-1.2deg;padding:50px 50px 72px">
  <p class="an" style="font-size:230px;line-height:.86">Fala<br>de mesa</p>
  <p class="co" style="font-size:48px;margin-top:22px">5 palavras que você vai ouvir no clube</p>
</div>
${adesivo('Blind', '', 'left:60px;top:716px;--g:-4deg', 0)}
${adesivo('Flop', 'preto', 'left:420px;top:700px;--g:3deg', 1)}
${adesivo('Turn', '', 'left:730px;top:752px;--g:-2deg', 0)}
${adesivo('River', 'preto', 'left:150px;top:905px;--g:2deg', 1)}
${adesivo('All-in', '', 'left:540px;top:930px;--g:-3deg', 0)}
<p class="co lc" style="position:absolute;right:52px;top:1092px;display:flex;align-items:center;gap:10px;font-size:40px">Arraste ${ico('dir', 44, 'stroke-width:3')}</p>
${rod()}` };

P['c02-glossario-2'] = { fmt: 'feed', html: `
${resto('right:-50px;top:200px;width:200px;height:700px;--g:1.5deg')}
<div class="cartaz ra" style="left:40px;top:44px;width:1000px;--g:-.6deg;padding:62px 50px 64px">
  <p class="an" style="font-size:150px">Blind</p>
  <p class="co lj" style="font-size:38px;margin-top:8px">Small blind e big blind</p>
  <p class="tx" style="margin-top:14px">Aposta obrigatória antes das cartas. Os dois jogadores à esquerda do botão pagam: o small blind e o big blind.</p>
  <div style="border-top:6px solid var(--tinta);margin:34px 0 30px"></div>
  <div style="display:grid;grid-template-columns:1fr auto;gap:0 30px;align-items:end">
    <div><p class="an" style="font-size:150px">Flop</p>
    <p class="tx" style="margin-top:14px">As três primeiras cartas abertas na mesa, todas de uma vez.</p></div>
  </div>
  <div style="margin-top:28px;background:var(--tinta);padding:22px 26px;display:inline-flex;border-radius:6px">${mao('Kh 7s 2d x x', 108)}</div>
</div>
${rod()}` };

P['c02-glossario-3'] = { fmt: 'feed', html: `
<div class="cartaz rb" style="left:40px;top:46px;width:1000px;--g:.6deg;padding:50px 50px 64px">
  <div style="background:var(--tinta);padding:24px 26px;display:inline-flex;border-radius:6px">${mao('Kh 7s 2d 9c* Ah*', 128, 'gap:22px')}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 40px;margin-top:34px">
    <div><p class="an" style="font-size:120px">Turn</p><p class="tx" style="margin-top:10px">A quarta carta da mesa.</p></div>
    <div><p class="an" style="font-size:120px">River</p><p class="tx" style="margin-top:10px">A quinta e última carta da mesa.</p></div>
  </div>
</div>
<div class="cartaz laranja rc" style="left:40px;top:624px;width:1000px;--g:-1deg;padding:60px 50px 48px">
  <p class="an" style="font-size:170px">All-in</p>
  <p class="tx" style="font-size:38px;margin-top:14px">Apostar todas as fichas que você tem na mesa, de uma vez.</p>
  <p class="co" style="font-size:36px;margin-top:20px">Das fichas da mesa. Nunca do dinheiro das contas.</p>
</div>
${rod()}` };

/* ===================================================================== */

/* =====================================================================
   CARROSSEL K01 — como entrar no clube (telas 2 a 6; a tela 1 é a capa com foto em capa-foto.html)
   ===================================================================== */
const passoGrande = (n, titulo, apoio, extra = '', laranja = false) => `
${raio(n % 2 ? 'left:900px;top:-120px;height:900px' : 'left:-190px;top:240px;height:900px')}
<span class="an ${laranja ? 'pa' : 'lc'}" style="position:absolute;left:46px;top:30px;font-size:430px;line-height:.82">${n}</span>
<p class="co gz" style="position:absolute;left:330px;top:96px;font-size:40px">Passo ${n} de 3</p>
<div class="cartaz ${laranja ? 'laranja rc' : 'rb'}" style="left:40px;top:400px;width:1000px;--g:${n % 2 ? '-.8' : '.8'}deg;padding:${laranja ? '58px 50px 44px' : '44px 50px 62px'}">
  <p class="an" style="font-size:104px;text-wrap:balance">${titulo}</p>
  <p class="tx" style="font-size:40px;margin-top:18px;max-width:880px">${apoio}</p>
</div>
${extra}
${rod()}`;

P['k01-como-entrar-2'] = { fmt: 'feed', html: passoGrande(1, 'Deixe seu e-mail', 'Em <b>hotpoker.club</b> (o link está na bio). Leva uns 10 segundos e o passo a passo chega com o link do clube.',
  `<div class="cartaz preto ra" style="left:120px;top:900px;width:840px;--g:1.5deg;padding:38px 44px 38px;display:flex;align-items:center;gap:22px">
     <p class="an pa" style="font-size:64px">Sem senha. Sem documento.</p></div>`) };

P['k01-como-entrar-3'] = { fmt: 'feed', html: passoGrande(2, 'Baixe o Suprema Poker e abra pelo link', 'Grátis na App Store e no Google Play. Entrando pelo link do clube, você já cai no <b>clube 33548</b> com o <b>agente 768286</b>.',
  `<div class="cartaz rc" style="left:300px;top:972px;width:720px;--g:-2deg;padding:46px 40px 30px">
     <p class="an" style="font-size:58px">Não precisa procurar o clube.</p></div>`, true) };

P['k01-como-entrar-4'] = { fmt: 'feed', html: `
${raio('left:900px;top:-120px;height:900px')}
<span class="an lc" style="position:absolute;left:46px;top:30px;font-size:430px;line-height:.82">3</span>
<p class="co gz" style="position:absolute;left:330px;top:96px;font-size:40px">Passo 3 de 3</p>
<div class="cartaz rb" style="left:40px;top:400px;width:1000px;--g:-.8deg;padding:44px 50px 56px">
  <p class="an" style="font-size:104px">Fichas por PIX</p>
  <p class="tx" style="font-size:38px;margin-top:14px">No canal de fichas, o Fichas 24h. Na primeira compra, tenha à mão:</p>
</div>
<div class="cartaz laranja rc" style="left:70px;top:770px;width:940px;--g:1deg;padding:46px 46px 30px">
  <ol class="lista">
    <li style="padding:12px 0"><p class="an" style="font-size:70px">Seu ID de jogador</p><p class="tx" style="font-size:30px">Fica no seu perfil, dentro do app.</p></li>
    <li style="padding:12px 0"><p class="an" style="font-size:70px">Clube 33548 · Agente 768286</p></li>
  </ol>
</div>
${rod()}` };

P['k01-como-entrar-5'] = { fmt: 'feed', html: `
${resto('right:-50px;top:180px;width:220px;height:640px;--g:1.5deg')}
<div class="cartaz rb" style="left:40px;top:50px;width:1000px;--g:-1deg;padding:44px 50px 60px">
  <p class="an" style="font-size:120px">Salve os números</p>
  <p class="co lj" style="font-size:44px;margin-top:10px">Tire print desta tela</p>
</div>
<div class="cartaz preto ra" style="left:60px;top:380px;width:960px;--g:.8deg;padding:52px 50px 52px">
  <p class="co gz" style="font-size:40px">Clube</p><p class="an lc" style="font-size:190px;line-height:.9">33548</p>
  <p class="co gz" style="font-size:40px;margin-top:26px">Agente</p><p class="an pa" style="font-size:190px;line-height:.9">768286</p>
</div>
<div class="cartaz laranja rc" style="left:100px;top:1000px;width:900px;--g:-1.5deg;padding:44px 40px 26px">
  <p class="an" style="font-size:48px">Saque por PIX no seu CPF · Suporte humano 24h</p>
</div>
${rod({ num: false })}` };

P['k01-como-entrar-6'] = { fmt: 'feed', html: `
${raio('left:-160px;top:-160px;height:860px')}
<div class="cartaz laranja rb" style="left:40px;top:60px;width:1000px;--g:-.8deg;padding:56px 52px 72px">
  <div>${trava(120, 'ti')}</div>
  <p class="an" style="font-size:118px;margin-top:34px">Começa pelo<br>link na bio</p>
  <p class="an min" style="font-size:92px;margin-top:20px">hotpoker.club</p>
</div>
<div class="cartaz rc" style="left:80px;top:790px;width:920px;--g:1.2deg;padding:48px 44px 30px">
  <p class="tx" style="font-size:36px"><b>Canal no Telegram:</b> t.me/hotpokerclub</p>
  <p class="tx" style="font-size:36px;margin-top:10px"><b>+18.</b> Defina seu limite antes de sentar. Poker é jogo, não é investimento.</p>
</div>
${rod()}` };

function montar(fmt) {
  const id = new URLSearchParams(location.search).get('id');
  const el = document.getElementById('peca');
  const p = P[id];
  if (!p || p.fmt !== fmt) {
    el.innerHTML = `<p class="an pa" style="padding:60px;font-size:60px">Peça não encontrada para este formato: ${id}</p>`
      + `<p class="tx gz" style="padding:0 60px">${Object.keys(P).filter(k => P[k].fmt === fmt).join('<br>')}</p>`;
    return;
  }
  el.innerHTML = p.html;
  document.title = 'Hot Poker · ' + id;
}
