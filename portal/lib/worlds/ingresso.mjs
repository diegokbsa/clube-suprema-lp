// Mundo "Ingresso de mesa": Página inteira como um ingresso/canhoto: picote, código de barras, campos de formulário impressos, fonte mono.
// Pele em public/assets/worlds/ingresso.css. Blocos-assinatura abaixo (nome começa por "ingresso_").
import { esc, safeHref, para, list, btn, img, variant, F, HEAD } from '../block-kit.mjs';

export const world = {
  name: 'Ingresso de mesa',
  description: 'Página inteira como um ingresso/canhoto: picote, código de barras, campos de formulário impressos, fonte mono.',
  // fontes que a pele usa (precisam estar em FONTS de lib/templates.mjs)
  fonts: [],
};

export const blocks = {};
