// Markdown mínimo e previsível para os posts do blog (sem dependências).
// Suporta: títulos (#..####), parágrafos, **negrito**, *itálico*, `código`, links, imagens com legenda,
// listas (- e 1.), citações (>), tabelas (| a | b |), régua (---), blocos de código (```),
// HTML cru (linha começando com <) e caixas :::cta / :::nota / :::dica / :::captura.

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const SITE_HOST = 'suprema.blog';
const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const sizes = new Map();

// Largura e altura de uma imagem de public/img (SVG, PNG, WebP ou JPEG), para o navegador reservar o espaço
// antes de ela carregar e a página não pular. Imagem de fora ou que não abre fica sem (null).
function imageSize(src) {
  if (!/^[/]img[/][\w/.-]+$/.test(src) || src.includes('..')) return null;
  if (sizes.has(src)) return sizes.get(src);
  let size = null;
  try {
    const b = fs.readFileSync(PUBLIC_DIR + src.slice(1));
    const pair = (w, h) => (w > 0 && h > 0 ? { w: Math.round(w), h: Math.round(h) } : null);
    if (src.endsWith('.svg')) {
      const tag = (b.toString('utf8', 0, 4000).match(/<svg\b[^>]*>/) || [''])[0];
      const num = (name) => parseFloat((tag.match(new RegExp(`\\s${name}="([\\d.]+)(px)?"`)) || [])[1]);
      const box = (tag.match(/viewBox="[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)"/) || []).slice(1).map(Number);
      size = pair(num('width') || box[0], num('height') || box[1]);
    } else if (b.readUInt32BE(0) === 0x89504e47) {
      size = pair(b.readUInt32BE(16), b.readUInt32BE(20));
    } else if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
      const chunk = b.toString('ascii', 12, 16);
      if (chunk === 'VP8 ') size = pair(b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff);
      else if (chunk === 'VP8L') { const v = b.readUInt32LE(21); size = pair((v & 0x3fff) + 1, ((v >>> 14) & 0x3fff) + 1); }
      else if (chunk === 'VP8X') size = pair(b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1);
    } else if (b[0] === 0xff && b[1] === 0xd8) {
      for (let i = 2; i + 9 < b.length;) {
        if (b[i] !== 0xff) { i++; continue; }
        const marker = b[i + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) { size = pair(b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)); break; }
        i += 2 + b.readUInt16BE(i + 2);
      }
    }
  } catch { /* sem tamanho */ }
  sizes.set(src, size);
  return size;
}

const sizeAttrs = (src) => {
  const s = imageSize(src);
  return s ? ` width="${s.w}" height="${s.h}"` : '';
};

export function slugify(text) {
  return String(text)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function linkAttrs(href) {
  const external = /^https?:\/\//i.test(href) && !new RegExp(`^https?://(www\\.)?${SITE_HOST.replace('.', '\\.')}(/|$)`, 'i').test(href);
  return external ? ' target="_blank" rel="noopener"' : '';
}

// Formatação dentro de uma linha (texto já escapado).
export function inline(text) {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, alt, src) => `<img src="${src}" alt="${alt}"${sizeAttrs(src)} loading="lazy" decoding="async">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `<a href="${href}"${linkAttrs(href)}>${label}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return s;
}

const BOXES = {
  cta: { cls: 'post-cta', title: '' },
  nota: { cls: 'post-note', title: 'Nota' },
  dica: { cls: 'post-tip', title: 'Dica' },
  captura: { cls: 'post-shot', title: 'Captura de tela' },
};

export function renderMarkdown(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const headings = [];
  const images = [];
  let words = 0;
  let i = 0;

  const countWords = (t) => { words += (t.match(/[\p{L}\p{N}]+/gu) || []).length; };
  const para = (buf) => {
    if (!buf.length) return;
    const text = buf.join(' ').trim();
    countWords(text);
    out.push(`<p>${inline(text)}</p>`);
  };

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // Bloco de código
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // Caixas :::tipo [título]
    const box = line.match(/^:::(cta|nota|dica|captura)(?:\s+(.*))?$/);
    if (box) {
      const def = BOXES[box[1]];
      const title = box[2] || def.title;
      const buf = [];
      i++;
      while (i < lines.length && !/^:::\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      const innerMd = renderMarkdown(buf.join('\n'));
      words += innerMd.words;
      images.push(...innerMd.images);
      out.push(`<aside class="${def.cls}">${title ? `<strong class="box-title">${inline(title)}</strong>` : ''}${innerMd.html}</aside>`);
      continue;
    }

    // HTML cru: passa até a linha em branco
    if (/^</.test(line)) {
      const buf = [];
      while (i < lines.length && lines[i].trim()) buf.push(lines[i++]);
      const raw = buf.join('\n');
      for (const m of raw.matchAll(/<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"/g)) images.push({ src: m[1], alt: m[2] });
      out.push(raw);
      continue;
    }

    // Título
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      let id = slugify(text);
      if (headings.some((x) => x.id === id)) id = `${id}-${headings.length}`;
      headings.push({ level, text, id });
      countWords(text);
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      i++;
      continue;
    }

    // Régua
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

    // Imagem em linha própria vira figure com legenda
    const img = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$/);
    if (img) {
      const [, alt, src, caption] = img;
      images.push({ src, alt, caption: caption || '' });
      out.push(`<figure><img src="${src}" alt="${escapeHtml(alt)}"${sizeAttrs(src)} loading="lazy" decoding="async">${caption ? `<figcaption>${inline(caption)}</figcaption>` : ''}</figure>`);
      i++;
      continue;
    }

    // Citação
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      const innerMd = renderMarkdown(buf.join('\n'));
      words += innerMd.words;
      out.push(`<blockquote>${innerMd.html}</blockquote>`);
      continue;
    }

    // Tabela
    if (/^\|/.test(line) && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const cells = (l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(cells(lines[i++]));
      head.forEach(countWords);
      rows.flat().forEach(countWords);
      out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }

    // Listas
    const li = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (li) {
      const ordered = /\d+\./.test(li[2]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        if (m && m[1].length === li[1].length) { items.push(m[3]); i++; continue; }
        // continuação do item (linha indentada ou texto sem marcador)
        if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) { items[items.length - 1] += ' ' + lines[i].trim(); i++; continue; }
        break;
      }
      items.forEach(countWords);
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`);
      continue;
    }

    // Parágrafo
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|:::|>|\||!\[|<|(\s*)([-*]|\d+\.)\s|-{3,}\s*$)/.test(lines[i])) buf.push(lines[i++]);
    if (!buf.length) { buf.push(lines[i++]); }
    para(buf);
  }

  return { html: out.join('\n'), headings, images, words };
}
