// Instala o cliente Hot Poker no portal (edição SX): operação do clube 33548, site no domínio hotpoker.club com as páginas
// próprias (raiz + /1 a /4), posts do blog (dia 1 publicado, dias 2 a 7 agendados às 9h de Brasília) e o login do dono,
// que só enxerga esta operação. Idempotente: rodar de novo atualiza páginas e settings e não duplica nada.
//   node portal/tools/hot-poker-instalar.mjs --dados <pasta de dados do portal> [--seco]
// A senha inicial do dono vai para <dados>/credenciais-hot-poker.txt (nunca para a tela nem para log).
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { openDb, now } from '../lib/db.mjs';
import { createTenant, cleanSettings, audit } from '../lib/tenants.mjs';
import { cleanTheme } from '../lib/templates.mjs';
import { scoped, registerTable } from '../lib/repo.mjs';
import { createUser } from '../lib/auth.mjs';
import { gravarPagina } from '../lib/modules/paginas.mjs';
import { publishedData } from '../lib/modules/blog.mjs';
import { WORLDS } from '../lib/worlds/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const ARGS = process.argv.slice(2);
const opt = (k) => { const i = ARGS.indexOf(k); return i >= 0 ? ARGS[i + 1] : null; };
const DADOS = opt('--dados');
const SECO = ARGS.includes('--seco');
if (!DADOS) { console.error('uso: node portal/tools/hot-poker-instalar.mjs --dados <pasta de dados> [--seco]'); process.exit(2); }

const DOMINIO = 'hotpoker.club';
const DONO = 'hotpokerclub@gmail.com';
const SETTINGS = {
  app: 'Suprema Poker', agentId: '768286', whatsapp: '5511952138293', chipsUrl: 'https://app.fichas24horas.com.br/signup',
  instagram: '@hotpoker.agent', facebook: 'https://www.facebook.com/share/g/1KJNHrXUSF/', email: DONO,
  logo: '/assets/hot-poker/chama.svg', tagline: 'Clube de poker no app Suprema Poker: fichas por PIX e suporte humano 24h.',
  timezone: 'America/Sao_Paulo', postsPerDay: 1, postTimes: '09:00',
  inviteLink: 'https://supremapoker.onelink.me/xDgV?deep_link_value=eyJsaW5rdHlwZSI6MSwiY2x1YmlkIjozMzU0OCwiYWdlbnRpZCI6NzY4Mjg2LCJwbGF5ZXJpZCI6NzY4Mjg2LCJjcmVhdGV0aW1lIjoiMTc5NDAwNzYxNTcyNSJ9',
};
const SITE_DIR = path.join(ROOT, 'conteudo', 'hot-poker', 'site');
const BLOG_DIR = path.join(ROOT, 'conteudo', 'hot-poker', 'blog');
const PAGINAS = [
  { caminho: '', arquivo: 'raiz.html', titulo: 'Hot Poker · muro de lambe-lambe', indexar: true },
  { caminho: '1', arquivo: '1.html', titulo: 'Hot Poker · escala de calor', indexar: false },
  { caminho: '2', arquivo: '2.html', titulo: 'Hot Poker · álbum de figurinhas', indexar: false },
  { caminho: '3', arquivo: '3.html', titulo: 'Hot Poker · radar de raios', indexar: false },
  { caminho: '4', arquivo: '4.html', titulo: 'Hot Poker · caixa de fósforos', indexar: false },
];

/** 09:00 em Brasília (UTC-3, sem horário de verão) do dia `d` a partir de hoje (d = 0 é hoje). */
function nove(d) {
  const hojeBr = new Date(Date.now() - 3 * 3600e3);
  return new Date(Date.UTC(hojeBr.getUTCFullYear(), hojeBr.getUTCMonth(), hojeBr.getUTCDate() + d, 12, 0, 0)).toISOString();
}

registerTable('posts');
registerTable('paginas_proprias');
// --seco: roda numa cópia do banco (VACUUM INTO) e não toca no original
let arquivoDb = path.join(DADOS, 'portal.db');
let pastaSeco = null; // cópia do ensaio: apagada no fim (tem dados de login)
if (SECO) {
  pastaSeco = fs.mkdtempSync(path.join(os.tmpdir(), 'hot-poker-seco-'));
  const copia = path.join(pastaSeco, 'portal.db');
  const orig = openDb(arquivoDb); orig.exec(`VACUUM INTO '${copia.replace(/'/g, "''")}'`); orig.close();
  arquivoDb = copia;
}
const db = openDb(arquivoDb);
const relato = [];
const passo = (m) => { relato.push(m); console.log(`· ${m}`); };

try {
  // 1. operação
  let tenant = db.prepare("SELECT * FROM tenants WHERE edition = 'sx' AND number = '33548'").get();
  if (!tenant) {
    ({ tenant } = createTenant(db, { name: 'Hot Poker', number: '33548', niche: 'poker', slug: 'hot-poker', edition: 'sx', settings: SETTINGS }));
    passo(`operação criada: Hot Poker (clube 33548), id ${tenant.id}`);
  } else {
    const atual = JSON.parse(tenant.settings || '{}');
    db.prepare('UPDATE tenants SET name = ?, settings = ? WHERE id = ?').run('Hot Poker', JSON.stringify({ ...atual, ...cleanSettings('poker', { ...atual, ...SETTINGS }) }), tenant.id);
    passo(`operação já existia (${tenant.slug}); settings atualizadas`);
  }
  const repo = scoped(db, tenant.id);

  // 2. site no domínio próprio (tema = paleta "chama" do mundo lambe-lambe: Anton + Barlow)
  const chama = WORLDS.rack.palettes.find((p) => p.id === 'chama').colors;
  const tema = cleanTheme({ ...chama, font: 'Barlow', fontHead: 'Anton', radius: 4 });
  let site = db.prepare('SELECT * FROM sites WHERE domain = ?').get(DOMINIO);
  if (site && site.tenant_id !== tenant.id) throw new Error(`o domínio ${DOMINIO} já está em outra operação`);
  if (!site) {
    let slug = 'hot-poker';
    for (let i = 2; db.prepare('SELECT 1 FROM sites WHERE slug = ?').get(slug); i++) slug = `hot-poker-${i}`;
    site = repo.insert('sites', { slug, name: 'Hot Poker', template_id: null, template_version: null, domain: DOMINIO, theme: JSON.stringify(tema),
      seo: JSON.stringify({ title: 'Hot Poker · Clube 33548 no Suprema Poker', description: SETTINGS.tagline }), tracking: '{}', status: 'publicado' });
    passo(`site criado: ${DOMINIO} (/s/${slug}/)`);
  } else {
    repo.update('sites', site.id, { theme: JSON.stringify(tema), status: 'publicado' });
    passo(`site já existia: ${DOMINIO}`);
  }

  // 3. páginas próprias
  for (const p of PAGINAS) {
    const html = fs.readFileSync(path.join(SITE_DIR, p.arquivo), 'utf8');
    gravarPagina(repo, { siteId: site.id, caminho: p.caminho, html, titulo: p.titulo, indexar: p.indexar });
    passo(`página ${p.caminho ? `/${p.caminho}` : '/ (raiz)'} gravada (${Math.round(html.length / 1024)} KB, ${p.indexar ? 'indexa' : 'canonical na raiz'})`);
  }

  // 4. blog: dia 1 publicado agora, dias 2 a 7 agendados às 9h
  const arquivos = fs.existsSync(BLOG_DIR) ? fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.json')).sort() : [];
  let novos = 0; let agendados = 0;
  for (const f of arquivos) {
    const a = JSON.parse(fs.readFileSync(path.join(BLOG_DIR, f), 'utf8'));
    if (repo.get('posts', { site_id: site.id, slug: a.slug })) continue;
    const dia = Math.max(1, Math.min(7, Number(a.dia) || 1));
    const base = { site_id: site.id, title: String(a.title).slice(0, 120), slug: a.slug, excerpt: String(a.excerpt || '').slice(0, 300), content: a.content,
      category: String(a.category || 'Geral').slice(0, 80), tags: JSON.stringify((a.tags || []).slice(0, 20)), author: a.author || 'Equipe Hot Poker',
      cover_url: a.coverUrl || null, seo_title: String(a.seoTitle || '').slice(0, 70), seo_description: String(a.seoDescription || '').slice(0, 170) };
    if (dia === 1) {
      const at = now();
      repo.insert('posts', { ...base, status: 'publicado', scheduled_at: null, published_at: at, published_slug: a.slug, published_data: JSON.stringify(publishedData(base, at)) });
    } else {
      repo.insert('posts', { ...base, status: 'agendado', scheduled_at: nove(dia - 1), published_at: null, published_slug: null, published_data: null });
      agendados++;
    }
    novos++;
  }
  passo(`blog: ${novos} posts novos (${novos - agendados} publicados agora, ${agendados} agendados às 9h dos próximos dias); ${arquivos.length - novos} já existiam`);

  // 5. login do dono: só esta operação, papel Administrador da operação
  let dono = db.prepare('SELECT * FROM users WHERE email = ?').get(DONO);
  let senha = null;
  if (!dono) {
    senha = `${randomBytes(9).toString('base64url')}7k`;
    dono = createUser(db, { email: DONO, name: 'Hot Poker', password: senha });
    passo(`login do dono criado: ${DONO}`);
  }
  if (dono.is_super) throw new Error('o e-mail do dono é superadministrador; não vinculo');
  db.prepare("INSERT INTO memberships (user_id, tenant_id, role) VALUES (?, ?, 'admin') ON CONFLICT(user_id, tenant_id) DO UPDATE SET role = 'admin'").run(dono.id, tenant.id);
  const outras = db.prepare('SELECT COUNT(*) n FROM memberships WHERE user_id = ? AND tenant_id != ?').get(dono.id, tenant.id).n;
  passo(`dono vinculado como Administrador da operação Hot Poker${outras ? ` (ATENÇÃO: também está em ${outras} outra(s) operação(ões))` : ' (só esta operação)'}`);
  if (senha && !SECO) {
    const f = path.join(DADOS, 'credenciais-hot-poker.txt');
    fs.writeFileSync(f, `Hot Poker — painel SX (https://sx.kbsa.app/admin/)\nE-mail: ${DONO}\nSenha: ${senha}\nTroque a senha depois de entrar.\n`, { mode: 0o600 });
    passo(`senha inicial do dono em ${f}`);
  }
  audit(db, { tenantId: tenant.id, action: 'hot_poker.instalar', target: tenant.id, data: { site: site.id, paginas: PAGINAS.length, posts: novos } });

  if (SECO) passo('ensaio (--seco): rodou numa cópia do banco; o original não mudou');
  console.log(JSON.stringify({ ok: true, tenant: tenant.id, site: site.id, slug: site.slug, relato }));
} catch (e) {
  console.log(JSON.stringify({ ok: false, erro: e.message, relato }));
  process.exitCode = 1;
} finally {
  db.close();
  if (pastaSeco) { try { fs.rmSync(pastaSeco, { recursive: true, force: true }); } catch { /* em uso: o SO limpa a pasta temporária */ } }
}
