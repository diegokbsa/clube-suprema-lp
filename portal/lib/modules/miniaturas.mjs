// Miniaturas de sites e páginas no painel (pedido do Kbsa, 09/11/2026: "falta também em páginas, as imagens dos blogs e
// modelos do site pra escolher") e criação de página a partir de uma página de modelo.
//   - cada página ganha uma captura 480x300 do RASCUNHO atual (topo em 1280x800, Chrome sem tela), refeita quando a página
//     muda (updated_at mais novo que o arquivo); site com domínio próprio ou site externo ganha a captura da home pública;
//   - as imagens ficam fora da pasta pública (<PORTAL_DATA_DIR>/miniaturas) e só saem pela API, para quem pode ver o site
//     (rascunho não vaza);
//   - a geração roda em segundo plano, uma captura por vez, a cada 5 minutos; sem Chrome na máquina, nada acontece.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HttpError } from '../http.mjs';
import { parse } from '../db.mjs';
import { scoped } from '../repo.mjs';
import { loadTemplates, fillPlaceholders } from '../templates.mjs';
import { templateVars, slugify } from '../tenants.mjs';
import { cleanBlocks } from '../blocks.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PASTA = process.env.PORTAL_MINIATURAS_DIR || path.join(process.env.PORTAL_DATA_DIR || path.join(HERE, '..', '..', 'data'), 'miniaturas');
const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium'].find((c) => c && fs.existsSync(c));
const need = (ok, status, msg) => { if (!ok) throw new HttpError(status, msg); };
export const arquivoDe = (tipo, id) => path.join(PASTA, `${tipo}-${String(id).replace(/[^a-zA-Z0-9-]/g, '')}.jpg`);
const versao = (f) => { try { return Math.floor(fs.statSync(f).mtimeMs / 1000).toString(36); } catch { return null; } };

/** Captura 480x300 (topo de 1280x800) de um endereço com o Chrome sem tela. Resolve true se gravou. */
export function capturar(url, destino, chrome = CHROME) {
  if (!chrome) return Promise.resolve(false);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-'));
  const tmp = `${destino}.tmp.jpeg`;
  return new Promise((ok) => execFile(chrome, ['--headless=new', `--user-data-dir=${perfil}`, '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--window-size=1280,800',
    '--force-device-scale-factor=0.375', '--virtual-time-budget=8000', `--screenshot=${tmp}`, url], { timeout: 60_000, windowsHide: true }, () => {
    let gravou = false;
    try { if (fs.existsSync(tmp) && fs.statSync(tmp).size > 2000) { fs.renameSync(tmp, destino); gravou = true; } } catch { /* fica sem */ }
    try { fs.rmSync(tmp, { force: true }); fs.rmSync(perfil, { recursive: true, force: true }); } catch { /* temporário */ }
    ok(gravou);
  }));
}

/** O que precisa de captura agora: páginas com rascunho mais novo que a miniatura e sites com home pública sem miniatura recente. */
export function pendentes(db, limite = 15) {
  const fila = [];
  for (const p of db.prepare('SELECT p.id, p.updated_at, p.tenant_id FROM pages p ORDER BY p.updated_at DESC').all()) {
    const f = arquivoDe('pagina', p.id);
    if (!fs.existsSync(f) || fs.statSync(f).mtimeMs < Date.parse(p.updated_at || 0)) fila.push({ tipo: 'pagina', id: p.id, tenantId: p.tenant_id });
    if (fila.length >= limite) return fila;
  }
  for (const s of db.prepare('SELECT id, domain, external_url FROM sites WHERE external_url IS NOT NULL OR domain IS NOT NULL').all()) {
    const f = arquivoDe('site', s.id);
    if (!fs.existsSync(f) || Date.now() - fs.statSync(f).mtimeMs > 24 * 3600_000) fila.push({ tipo: 'site', id: s.id, url: s.external_url || `https://${s.domain}/` });
    if (fila.length >= limite) break;
  }
  return fila;
}

/** Gera as miniaturas pendentes, uma por vez. A página sai do rascunho (prévia do construtor) com <base> para os arquivos. */
export async function gerarPendentes(app, { limite = 15, chrome = CHROME } = {}) {
  let feitas = 0;
  for (const item of pendentes(app.db, limite)) {
    let url = item.url;
    let tmpHtml = null;
    if (item.tipo === 'pagina') {
      const tenant = app.db.prepare('SELECT * FROM tenants WHERE id = ?').get(item.tenantId);
      if (!tenant) continue;
      let out;
      try { out = await app.preview({ repo: scoped(app.db, tenant.id), tenant, params: { id: item.id } }); } catch { continue; }
      const origem = app.originOf ? app.originOf(tenant.edition) : app.origin;
      tmpHtml = path.join(os.tmpdir(), `mini-${item.id}.html`);
      fs.writeFileSync(tmpHtml, String(out.body).replace(/<head([^>]*)>/i, `<head$1><base href="${origem}/">`));
      url = pathToFileURL(tmpHtml).href;
    }
    if (await capturar(url, arquivoDe(item.tipo, item.id), chrome)) feitas++;
    if (tmpHtml) fs.rmSync(tmpHtml, { force: true });
  }
  return feitas;
}

export function init(app) {
  if (process.env.NODE_TEST_CONTEXT || process.env.PORTAL_SEM_MINIATURAS || !CHROME) return;
  let rodando = false;
  const ciclo = async () => {
    if (rodando) return;
    rodando = true;
    try { await gerarPendentes(app); } catch (e) { console.warn(`[miniaturas] ${e.message}`); } finally { rodando = false; }
  };
  setTimeout(ciclo, 60_000).unref?.();
  setInterval(ciclo, 5 * 60_000).unref?.();
}

export const routes = [
  {
    // { paginas: { <id>: "<url>" }, sites: { <id>: "<url>" } } só das que já existem; a tela mostra a amostra de cor nas outras
    method: 'GET', path: '/api/t/:tenant/miniaturas', perm: 'site.read', handler: ({ repo, tenant }) => {
      const base = `/api/t/${tenant.slug}/miniaturas`;
      const mapa = (tipo, ids) => Object.fromEntries(ids.map((id) => [id, versao(arquivoDe(tipo, id))]).filter(([, v]) => v).map(([id, v]) => [id, `${base}/${tipo}-${id}.jpg?v=${v}`]));
      return { paginas: mapa('pagina', repo.all('pages').map((p) => p.id)), sites: mapa('site', repo.all('sites').map((s) => s.id)) };
    },
  },
  {
    method: 'GET', path: '/api/t/:tenant/miniaturas/:arquivo', perm: 'site.read', handler: ({ repo, params, res }) => {
      const m = /^(pagina|site)-([a-zA-Z0-9-]+)\.jpg$/.exec(params.arquivo);
      need(m, 404, 'Miniatura não encontrada.');
      need(repo.get(m[1] === 'pagina' ? 'pages' : 'sites', m[2]), 404, 'Miniatura não encontrada.'); // só da própria operação
      const f = arquivoDe(m[1], m[2]);
      need(fs.existsSync(f), 404, 'Miniatura ainda não gerada.');
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
      res.end(fs.readFileSync(f));
      return null;
    },
  },
  {
    // nova página a partir de uma página de modelo (galeria "Nova página"): blocos do modelo com os dados da operação
    method: 'POST', path: '/api/t/:tenant/sites/:id/pages/de-modelo', perm: 'site.edit', handler: ({ repo, tenant, params, body, audit, user }) => {
      const s = repo.get('sites', params.id);
      need(s, 404, 'Site não encontrado.');
      const limits = parse(tenant.limits, {});
      need(repo.count('pages', { site_id: s.id }) < (limits.pages || 60), 400, 'Limite de páginas atingido.');
      const t = loadTemplates().get(String(body.template || ''));
      need(t && (t.niches.includes('*') || t.niches.includes(tenant.niche_id)), 400, 'Escolha um modelo deste nicho.');
      const p = t.pages.find((x) => x.slug === String(body.pagina ?? '')) || t.pages[0];
      const vars = templateVars(tenant, parse(tenant.settings, {}));
      const blocks = cleanBlocks(fillPlaceholders(p.blocks, vars));
      const title = String(body.title || fillPlaceholders(p.title, vars) || t.name).slice(0, 80);
      let slug = slugify(body.slug || title) || 'pagina';
      for (let i = 2; repo.get('pages', { site_id: s.id, slug }); i++) slug = `${slugify(body.slug || title) || 'pagina'}-${i}`;
      const page = repo.insert('pages', { site_id: s.id, slug, title, position: repo.count('pages', { site_id: s.id }), seo: JSON.stringify(fillPlaceholders(p.seo || {}, vars)), draft: JSON.stringify(blocks) });
      repo.insert('page_versions', { page_id: page.id, blocks: page.draft, note: `criada da página "${p.slug || 'inicial'}" do modelo ${t.id} v${t.version}`, created_by: user.id });
      audit('pagina.criar', page.id, { slug, template: t.id, pagina: p.slug });
      return { status: 201, body: { page: { id: page.id, slug: page.slug, title: page.title } } };
    },
  },
];
