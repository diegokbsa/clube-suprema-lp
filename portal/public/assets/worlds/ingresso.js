// Interação-assinatura do mundo "ingresso": quando o formulário do ingresso é enviado com sucesso (o site.js marca form.ok),
// o canhoto se destaca no picote, recebe o e-mail como titular e é carimbado; o passo seguinte aparece no lugar do formulário.
// Nada muda de altura nessa troca: com JS o passo seguinte já ocupa o lugar dele escondido (classe ing-js no ingresso), a tesoura tem
// as duas frases empilhadas e o titular é uma linha só. O canhoto só se move com transform.
// Sem JS o formulário envia normalmente (o servidor volta com ?enviado=1). Com prefers-reduced-motion o canhoto só muda de lugar, sem animação.
(() => {
  if (document.body.dataset.world !== 'ingresso') return;
  const dois = (n) => String(n).padStart(2, '0');

  document.querySelectorAll('[data-ticket]').forEach((ticket) => {
    const form = ticket.querySelector('form.lead-form');
    if (!form) return;
    const proximo = ticket.querySelector('[data-proximo]');
    const titular = ticket.querySelector('[data-titular]');
    const data = ticket.querySelector('[data-carimbo-data]');
    const campoEmail = form.querySelector('[name=email]');
    let email = '';
    ticket.classList.add('ing-js');

    // o site.js limpa o formulário depois do envio: guarda o e-mail na hora do envio
    form.addEventListener('submit', () => { email = (campoEmail?.value || '').trim(); });

    const destacar = (animar) => {
      if (titular && email) titular.textContent = email;
      if (data) { const d = new Date(); data.textContent = `${data.dataset.base ? `${data.dataset.base} · ` : ''}${dois(d.getDate())}/${dois(d.getMonth() + 1)}`; }
      ticket.classList.toggle('sem-anim', !animar);
      ticket.classList.add('destacado');
      form.setAttribute('aria-hidden', 'true');
      form.inert = true;
      if (proximo) {
        proximo.hidden = false;
        if (animar) proximo.querySelector('h2')?.focus({ preventScroll: true });
      }
    };

    const refazer = () => {
      ticket.classList.remove('destacado', 'sem-anim');
      form.removeAttribute('aria-hidden');
      form.inert = false;
      form.classList.remove('ok');
      const msg = form.querySelector('.form-msg');
      if (msg) msg.textContent = '';
      if (proximo) proximo.hidden = true;
      if (titular) titular.textContent = titular.dataset.vazio || '';
      if (data) data.textContent = data.dataset.base || '';
      if (campoEmail) { campoEmail.value = email; campoEmail.focus({ preventScroll: true }); campoEmail.select(); }
    };

    if (form.classList.contains('ok')) destacar(false); // voltou do envio sem JS (?enviado=1)
    new MutationObserver(() => {
      if (form.classList.contains('ok') && !ticket.classList.contains('destacado')) destacar(true);
    }).observe(form, { attributes: true, attributeFilter: ['class'] });
    proximo?.querySelector('[data-refazer]')?.addEventListener('click', refazer);
  });
})();
