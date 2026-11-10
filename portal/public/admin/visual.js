// Visual do painel (ordem do Kbsa, 07/11/2026: "branca, detalhes roxo, e o botão disponível pra trocar pelas outras").
// Roda no <head>, antes de pintar, para não piscar o visual errado. A escolha fica salva neste aparelho (localStorage).
// "original" volta às cores da edição (SX areia/petróleo, Geral verde/dourado).
(function () {
  var LISTA = [
    // 1º da lista e padrão (Kbsa, 10/11: "vidro em branco com roxo, primeiro modelo"); o id segue 'lavanda' para não perder a escolha salva
    { id: 'lavanda', nome: 'Vidro Branco e Roxo', tipo: 'claro · vidro · padrão', fundo: '#fbfaff', acento: '#7f35da', fonte: 'Hanken+Grotesk:wght@400..800' },
    { id: 'branco', nome: 'Branco', tipo: 'claro', fundo: '#ffffff', acento: '#7f35da' },
    { id: 'ameixa', nome: 'Ameixa à Noite', tipo: 'escuro · vidro', fundo: '#05070b', acento: '#bc7aff', fonte: 'Schibsted+Grotesk:wght@400..800' },
    { id: 'planilha', nome: 'Planilha Viva', tipo: 'claro · denso', fundo: '#f7f6fb', acento: '#6f2bd0', fonte: 'IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500' },
    { id: 'relatorio', nome: 'Relatório do Dia', tipo: 'claro · editorial', fundo: '#f6f5fa', acento: '#6a24c4', fonte: 'Newsreader:opsz,wght@6..72,400..700&family=Public+Sans:wght@400..700' },
    { id: 'profundo', nome: 'Vidro Profundo', tipo: 'claro · vidro forte', fundo: '#7f35da', acento: '#ffffff', fonte: 'Familjen+Grotesk:wght@400..700' },
    { id: 'console', nome: 'Console', tipo: 'escuro · denso', fundo: '#0a0910', acento: '#bc7aff', fonte: 'Geist:wght@400..700&family=Geist+Mono:wght@400..600' },
    { id: 'quadro', nome: 'Quadro de Estados', tipo: 'claro · cartões', fundo: '#f3f0fb', acento: '#7f35da', fonte: 'Albert+Sans:wght@400..800' },
    { id: 'bolso', nome: 'Bolso', tipo: 'escuro · arredondado', fundo: '#0e0b16', acento: '#c08bff', fonte: 'Onest:wght@400..800' },
    { id: 'suica', nome: 'Grade Suíça', tipo: 'claro · alto contraste', fundo: '#f5f5f8', acento: '#05070b', fonte: 'Archivo:wdth,wght@62..125,400..900' },
    { id: 'observatorio', nome: 'Observatório', tipo: 'escuro · vidro', fundo: '#0d0a17', acento: '#bc7aff', fonte: 'Red+Hat+Display:wght@400..800&family=Red+Hat+Mono:wght@400..600' },
    { id: 'original', nome: 'Original da edição', tipo: 'cores da SX ou da Geral', fundo: '#e7e4de', acento: '#3aa8c9' },
  ];
  var CHAVE = 'portal.visual';
  var PADRAO = 'lavanda'; // Kbsa, 09 e 10/11/2026: vidro branco e roxo como padrão e 1º da lista, botão para trocar
  var raiz = document.documentElement;
  var emUso = PADRAO;

  function lido() {
    try { return localStorage.getItem(CHAVE) || PADRAO; } catch (e) { return PADRAO; }
  }
  function acha(id) {
    for (var i = 0; i < LISTA.length; i++) if (LISTA[i].id === id) return LISTA[i];
    return null;
  }
  function fonte(v) {
    var velha = document.getElementById('fonte-visual');
    if (velha) velha.remove();
    if (!v.fonte) return; // Branco e Original usam as fontes que o index.html já carrega
    var l = document.createElement('link');
    l.id = 'fonte-visual';
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + v.fonte + '&display=swap';
    document.head.appendChild(l);
  }
  function aplicar(id, salvar) {
    var v = acha(id) || acha(PADRAO);
    if (v.id === 'original') delete raiz.dataset.visual; else raiz.dataset.visual = v.id;
    fonte(v);
    emUso = v.id;
    if (salvar) { try { localStorage.setItem(CHAVE, v.id); } catch (e) { /* aba anônima: vale só nesta visita */ } }
    return v;
  }

  // ?visual=<id> no endereço mostra aquele visual sem salvar (para mandar o link de uma prévia)
  var pedido = null;
  try { pedido = new URLSearchParams(location.search).get('visual'); } catch (e) { /* navegador antigo */ }
  aplicar(pedido && acha(pedido) ? pedido : lido(), false);
  window.PortalVisual = { lista: LISTA, padrao: PADRAO, atual: function () { return emUso; }, aplicar: aplicar };
})();
