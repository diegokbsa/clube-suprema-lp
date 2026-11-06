// Modelos de site: arquivos JSON em portal/templates/. Ao criar um site os blocos são COPIADOS para as páginas,
// então uma versão nova do modelo nunca muda o site de ninguém sozinha (o site guarda template_id + template_version).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanBlocks } from './blocks.mjs';
import { WORLD_IDS } from './worlds/index.mjs';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');
// As do primeiro grupo ficam para não quebrar site já criado; os mundos novos usam as do segundo (Google Fonts; pesos em lib/site.mjs).
export const FONTS = ['Inter', 'Manrope', 'Sora', 'DM Sans', 'Space Grotesk', 'Archivo', 'IBM Plex Sans', 'Outfit', 'Bricolage Grotesque',
  'Fraunces', 'Playfair Display', 'Barlow Condensed', 'Libre Franklin', 'Rubik',
  'Montserrat', 'Antonio', 'Anton', 'Oswald', 'Bebas Neue', 'Big Shoulders Display', 'Saira Condensed', 'Archivo Narrow', 'Barlow',
  'JetBrains Mono', 'Red Hat Mono', 'Chivo', 'Chivo Mono', 'Familjen Grotesk', 'Hanken Grotesk', 'Schibsted Grotesk', 'Red Hat Display',
  'Epilogue', 'Unbounded', 'Instrument Serif', 'Gloock', 'Bodoni Moda', 'Libre Caslon Text', 'Young Serif', 'Figtree', 'Onest', 'Geologica'];
const HEX = /^#[0-9a-f]{6}$/i;
const THEME_KEYS = ['bg', 'surface', 'text', 'muted', 'primary', 'primaryText', 'accent', 'border'];

export const DEFAULT_THEME = { mode: 'escuro', bg: '#0f1412', surface: '#17201c', text: '#f1efe8', muted: '#a7b0aa', primary: '#d8b25a',
  primaryText: '#16120a', accent: '#3d7853', border: '#2a3631', font: 'Manrope', fontHead: 'Sora', radius: 14 };

export function cleanTheme(t = {}) {
  const out = { ...DEFAULT_THEME };
  for (const k of THEME_KEYS) if (HEX.test(t[k] || '')) out[k] = t[k].toLowerCase();
  if (FONTS.includes(t.font)) out.font = t.font;
  if (FONTS.includes(t.fontHead)) out.fontHead = t.fontHead;
  if (FONTS.includes(t.fontMono)) out.fontMono = t.fontMono;
  if (WORLD_IDS.includes(t.world)) out.world = t.world;
  if (['escuro', 'claro'].includes(t.mode)) out.mode = t.mode;
  const r = Number(t.radius);
  if (Number.isFinite(r)) out.radius = Math.max(0, Math.min(28, Math.round(r)));
  return out;
}

/** Problemas de um modelo (lista vazia = válido). Usado pelo validador e pelos testes. */
export function templateProblems(t) {
  const errs = [];
  if (!/^[a-z0-9-]{3,60}$/.test(t?.id || '')) errs.push('id inválido (use minúsculas, números e hífen)');
  if (!t?.name) errs.push('falta name');
  if (!Number.isInteger(t?.version) || t.version < 1) errs.push('version deve ser inteiro >= 1');
  if (!Array.isArray(t?.niches) || !t.niches.length) errs.push('falta niches (ex.: ["poker"] ou ["*"])');
  if (!t?.category) errs.push('falta category');
  if (!Array.isArray(t?.pages) || !t.pages.length) errs.push('falta pages');
  const slugs = new Set();
  for (const p of t?.pages || []) {
    if (typeof p.slug !== 'string' || !/^[a-z0-9-]*$/.test(p.slug)) errs.push(`slug inválido: ${p.slug}`);
    if (slugs.has(p.slug)) errs.push(`slug repetido: ${p.slug}`);
    slugs.add(p.slug);
    if (!p.title) errs.push(`página ${p.slug || '(início)'} sem title`);
    try { cleanBlocks(p.blocks); } catch (e) { errs.push(`página ${p.slug || '(início)'}: ${e.message}`); }
  }
  if (!slugs.has('')) errs.push('falta a página inicial (slug "")');
  return errs;
}

let cache = null;
export function loadTemplates({ fresh = false } = {}) {
  if (cache && !fresh) return cache;
  const out = new Map();
  if (fs.existsSync(DIR)) {
    for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.json')).sort()) {
      try {
        const t = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
        if (!templateProblems(t).length) out.set(t.id, t);
        else console.warn(`[modelos] ${f} ignorado: ${templateProblems(t).join('; ')}`);
      } catch (e) {
        console.warn(`[modelos] ${f} ilegível: ${e.message}`);
      }
    }
  }
  cache = out;
  return out;
}

export function templateList(nicheId) {
  return [...loadTemplates().values()]
    .filter((t) => !nicheId || t.niches.includes('*') || t.niches.includes(nicheId))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name))
    .map((t) => ({ id: t.id, name: t.name, version: t.version, category: t.category, niches: t.niches, description: t.description || '',
      inspiredBy: t.inspiredBy || null, theme: cleanTheme(t.theme), pages: t.pages.map((p) => ({ slug: p.slug, title: p.title })),
      blocks: t.pages.find((p) => p.slug === '')?.blocks.map((b) => b.type) || [] }));
}

/** Troca {{chave}} pelos dados da operação em todos os textos do modelo. */
export function fillPlaceholders(value, vars) {
  if (typeof value === 'string') return value.replace(/\{\{(\w+)\}\}/g, (m, k) => (vars[k] != null && vars[k] !== '' ? String(vars[k]) : m.startsWith('{{') ? '' : m));
  if (Array.isArray(value)) return value.map((v) => fillPlaceholders(v, vars));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillPlaceholders(v, vars)]));
  return value;
}
