// Contagem regressiva da grade ao vivo (lib/grade-ao-vivo.mjs): "começa em 12 min", "late fecha em 4 min", "inscrição encerrada".
// Fica vermelha (cd-urgente) nos últimos 5 minutos antes do próximo marco. Só carrega nas páginas com [data-cd-ini].
(() => {
  const URGENTE = 5 * 60_000;
  const els = [...document.querySelectorAll('[data-cd-ini]')];
  if (!els.length) return;
  const dur = (ms) => {
    const m = Math.floor(ms / 60_000);
    if (m < 1) return 'menos de 1 min';
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
  };
  const linha = (el) => el.closest('tr, li');
  function tique() {
    const agora = Date.now();
    for (const el of els) {
      const ini = Date.parse(el.dataset.cdIni);
      const fim = Math.max(ini, Date.parse(el.dataset.cdFim || el.dataset.cdIni) || ini);
      if (!ini) continue;
      let fase; let texto; let resta = 0;
      if (agora < ini) { fase = 'antes'; resta = ini - agora; texto = `começa em ${dur(resta)}`; }
      else if (agora < fim) { fase = 'late'; resta = fim - agora; texto = `late fecha em ${dur(resta)}`; }
      else { fase = 'fim'; texto = 'inscrição encerrada'; }
      if (el.textContent !== texto) el.textContent = texto;
      el.className = `cd cd-${fase}${fase !== 'fim' && resta <= URGENTE ? ' cd-urgente' : ''}`;
      linha(el)?.classList.toggle('cd-passou', fase === 'fim');
    }
  }
  tique();
  let t = setInterval(tique, 15_000);
  document.addEventListener('visibilitychange', () => {
    clearInterval(t);
    if (!document.hidden) { tique(); t = setInterval(tique, 15_000); }
  });
})();
