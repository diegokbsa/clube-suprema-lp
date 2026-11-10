// Minilytics (mini.kbsa.app, fork diegokbsa/minilytics sem cookie) nos sites do Portal. Pedido do Kbsa em 09/11/2026.
// Um id por domínio, cadastrado no D1 do Minilytics. Domínio fora da lista não leva script.
export const MINILYTICS_HOST = 'https://mini.kbsa.app';
export const MINILYTICS_IDS = {
  'fornecedores.blog': 'b154a2a0b0ea6500',
  'sublima.casa': '2340181f4746c0f8',
  'criativos.blog': 'ac0f4dcc8674f491',
  'ianapratica.blog': '92bd7ba803eca966',
  'achadinhosnapratica.blog': 'feb88181a48e8b01',
  'oficinanapratica.blog': '98910a0ab9210e7b',
  'modolive.blog': '4acac03bf7357b6c',
  'afiliadodeverdade.blog': '4888599b2bd748e3',
  'milhas.blog': '5ad204a428f1592f',
  'atendefacil.blog': '00e86a48c99c663d',
  'hotpoker.club': '030961f8b7d5b073',
};

/** Tag do Minilytics (defer) para o site, ou '' quando o domínio não está cadastrado. */
export function tagMinilytics(site) {
  const dom = String(site?.domain || '').toLowerCase().replace(/^www\./, '');
  const id = MINILYTICS_IDS[dom];
  return id ? `<script defer data-website-id="${id}" src="${MINILYTICS_HOST}/js/script.js"></script>` : '';
}
