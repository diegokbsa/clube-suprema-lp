// Mundos visuais dos modelos de site. Cada mundo = um arquivo lib/worlds/<id>.mjs (blocos-assinatura) + public/assets/worlds/<id>.css
// (pele do mundo, escopada em body[data-world="<id>"], que restiliza também os blocos comuns). O tema do site escolhe o mundo em theme.world.
// Regra: blocos de um mundo começam pelo id dele (rack_hero, ingresso_form...). Este arquivo só registra; cada mundo cuida do seu.

import * as rack from './rack.mjs';
import * as transmissao from './transmissao.mjs';
import * as relogio from './relogio.mjs';
import * as ingresso from './ingresso.mjs';
import * as comprovante from './comprovante.mjs';
import * as encarte from './encarte.mjs';
import * as editorial from './editorial.mjs';
import * as produto from './produto.mjs';

const MODS = { rack, transmissao, relogio, ingresso, comprovante, encarte, editorial, produto };

export const WORLDS = Object.fromEntries(Object.entries(MODS).map(([id, m]) => [id, { id, ...m.world }]));
export const WORLD_IDS = Object.keys(WORLDS);
export const WORLD_BLOCKS = Object.assign({}, ...Object.values(MODS).map((m) => m.blocks || {}));
