// Criação de operação: operação + site a partir do modelo + páginas copiadas + integrações em "pendente de configuração".
import { randomBytes } from 'node:crypto';
import { id as newId, now, parse, tx } from './db.mjs';
import { scoped } from './repo.mjs';
import { niche, unitLabel } from './niches.mjs';
import { loadTemplates, cleanTheme, fillPlaceholders } from './templates.mjs';
import { cleanBlocks } from './blocks.mjs';

export const INTEGRATIONS = [
  { kind: 'ga4', label: 'Google Analytics 4 (ID de medição)', group: 'mensuracao' },
  { kind: 'gtm', label: 'Google Tag Manager', group: 'mensuracao' },
  { kind: 'meta_pixel', label: 'Meta Pixel', group: 'mensuracao' },
  { kind: 'meta_capi', label: 'Meta Conversions API', group: 'mensuracao' },
  { kind: 'clarity', label: 'Microsoft Clarity (ID do projeto)', group: 'mensuracao' },
  { kind: 'google_ads', label: 'Google Ads (tag AW- e conversão do lead)', group: 'mensuracao' },
  { kind: 'ga4_api', label: 'Google Analytics (relatórios)', group: 'relatorios' },
  { kind: 'instagram', label: 'Instagram (conta profissional)', group: 'redes' },
  { kind: 'telegram', label: 'Telegram (bot)', group: 'redes' },
  { kind: 'email_smtp', label: 'E-mail do CRM (Gmail / SMTP)', group: 'crm' },
  { kind: 'google_sheets', label: 'Planilha do Google (cópia de cada lead)', group: 'crm' },
  { kind: 'meta_ads', label: 'Meta Ads (conta de anúncios)', group: 'campanhas' },
  { kind: 'webhook_conversoes', label: 'Webhook de conversões', group: 'afiliacao' },
  { kind: 'indexnow', label: 'IndexNow (Bing, Yandex, Seznam, Naver, Yep)', group: 'seo' },
  { kind: 'google_search_console', label: 'Google Search Console', group: 'seo' },
  { kind: 'bing_webmaster', label: 'Bing Webmaster Tools', group: 'seo' },
];
const AUTO_ACTIVE = new Set(['webhook_conversoes', 'indexnow']); // funcionam sem credencial da operação

export const slugify = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

const SETTINGS_KEYS = ['whatsapp', 'telegram', 'instagram', 'facebook', 'email', 'timezone', 'attributionWindowDays', 'logo', 'tagline', 'postsPerDay', 'postTimes'];

export function cleanSettings(nicheId, input = {}) {
  const n = niche(nicheId);
  const out = {};
  for (const k of [...SETTINGS_KEYS, ...(n?.fields || []).map((f) => f.key)]) {
    if (input[k] != null && input[k] !== '') out[k] = typeof input[k] === 'number' ? input[k] : String(input[k]).slice(0, 300);
  }
  out.timezone ||= 'America/Sao_Paulo';
  out.attributionWindowDays = Number(out.attributionWindowDays) || n?.commission.windowDays || 30;
  out.postsPerDay = Math.max(0, Math.min(12, Number(out.postsPerDay ?? 3) || 3));
  out.postTimes ||= '12:00,15:00,18:00';
  return out;
}

/** Mensagem padrão do WhatsApp no pôquer (a mesma do suprema.blog): o suporte já sabe de que clube e agente a pessoa veio. */
function waTexto(tenant, settings) {
  if (tenant.niche_id !== 'poker') return '';
  const quem = [tenant.number && `do clube ${tenant.number}`, settings.agentId && `agente ${settings.agentId}`].filter(Boolean).join(', ');
  return quem ? `?text=${encodeURIComponent(`Oi! Venho ${quem}, e gostaria de suporte.`)}` : '';
}

/** Variáveis que os modelos usam em {{...}}. */
export function templateVars(tenant, settings) {
  const n = niche(tenant.niche_id);
  return { name: tenant.name, number: tenant.number || '', unit: n?.terms.unit || 'Operação', unitLabel: unitLabel(tenant.niche_id, tenant.number),
    customer: n?.terms.customer || 'Cliente', customers: n?.terms.customers || 'Clientes', partner: n?.terms.partner || 'Parceiro',
    whatsapp: settings.whatsapp || '', whatsappLink: settings.whatsapp ? `https://wa.me/${String(settings.whatsapp).replace(/\D/g, '')}${waTexto(tenant, settings)}` : '#contato',
    telegram: settings.telegram || '', instagram: settings.instagram || '', email: settings.email || '', tagline: settings.tagline || '',
    logo: settings.logo || '', disclaimer: n?.disclaimer || '', ...Object.fromEntries((n?.fields || []).map((f) => [f.key, settings[f.key] || ''])) };
}

/**
 * Cria a operação e o primeiro site. input: { name, number, niche, slug?, settings, modules, template, theme, demo }.
 * Lança erro com .status 400/409 em dado inválido.
 */
export function createTenant(db, input, { userId } = {}) {
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  const n = niche(input.niche);
  if (!n) throw bad('Escolha um nicho válido.');
  const name = String(input.name || '').trim().slice(0, 80);
  if (name.length < 2) throw bad('Dê um nome para a operação.');
  const number = String(input.number || '').trim().slice(0, 20);
  if (number && !/^[A-Za-z0-9-]+$/.test(number)) throw bad('O número aceita só letras, números e hífen.');
  const slug = slugify(input.slug || `${n.terms.unit}-${number || name}`);
  if (slug.length < 3) throw bad('Endereço curto demais.');
  if (db.prepare('SELECT 1 FROM tenants WHERE slug = ?').get(slug)) throw Object.assign(new Error('Já existe uma operação com esse endereço.'), { status: 409 });
  const template = input.template ? loadTemplates().get(input.template) : null;
  if (input.template && !template) throw bad('Modelo não encontrado.');
  if (template && !template.niches.includes('*') && !template.niches.includes(input.niche)) throw bad('Esse modelo não é deste nicho.');
  const settings = cleanSettings(input.niche, input.settings);
  const modules = Array.isArray(input.modules) ? input.modules.filter((m) => n.modules.includes(m)) : n.modules;

  return tx(db, () => {
    const tenant = { id: newId(), slug, name, number, niche_id: input.niche, settings: JSON.stringify(settings), modules: JSON.stringify(modules),
      limits: JSON.stringify({ sites: 5, pages: 60, usersMax: 25, ...(input.limits || {}) }), webhook_secret: randomBytes(24).toString('base64url'),
      status: 'ativa', demo: input.demo ? 1 : 0, created_at: now(), edition: input.edition === 'sx' ? 'sx' : 'geral' };
    db.prepare(`INSERT INTO tenants (id, slug, name, number, niche_id, settings, modules, limits, webhook_secret, status, demo, created_at, edition)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...Object.values(tenant));
    const repo = scoped(db, tenant.id);
    for (const i of INTEGRATIONS) {
      repo.insert('integrations', { kind: i.kind, status: AUTO_ACTIVE.has(i.kind) ? 'ativo' : 'pendente', public_config: '{}' });
    }
    let site = null;
    if (template) site = createSiteFromTemplate(db, tenant, template, { theme: input.theme, domain: input.domain, userId });
    if (input.externalUrl) {
      site = repo.insert('sites', { slug: `${slug}-legado`, name: `${name} (site atual)`, template_id: null, template_version: null,
        theme: JSON.stringify(cleanTheme(input.theme)), seo: '{}', tracking: '{}', external_url: String(input.externalUrl).slice(0, 200), status: 'externo' });
    }
    audit(db, { tenantId: tenant.id, userId, action: 'operacao.criar', target: tenant.id, data: { name, number, niche: input.niche, template: input.template || null } });
    return { tenant, site };
  });
}

export function createSiteFromTemplate(db, tenant, template, { theme, domain, userId, slug } = {}) {
  const repo = scoped(db, tenant.id);
  const settings = parse(tenant.settings, {});
  const vars = templateVars(tenant, settings);
  let siteSlug = slugify(slug || tenant.slug);
  for (let i = 2; db.prepare('SELECT 1 FROM sites WHERE slug = ?').get(siteSlug); i++) siteSlug = `${slugify(slug || tenant.slug)}-${i}`;
  const mergedTheme = cleanTheme({ ...(template.theme || {}), ...(theme || {}) });
  const site = repo.insert('sites', { slug: siteSlug, name: tenant.name, template_id: template.id, template_version: template.version,
    domain: domain ? String(domain).toLowerCase().slice(0, 120) : null, theme: JSON.stringify(mergedTheme),
    seo: JSON.stringify(fillPlaceholders(template.seo || { title: '{{name}}', description: '{{tagline}}' }, vars)), tracking: '{}', status: 'rascunho' });
  template.pages.forEach((p, position) => {
    const blocks = cleanBlocks(fillPlaceholders(p.blocks, vars));
    const page = repo.insert('pages', { site_id: site.id, slug: p.slug, title: fillPlaceholders(p.title, vars), position,
      seo: JSON.stringify(fillPlaceholders(p.seo || {}, vars)), draft: JSON.stringify(blocks) });
    repo.insert('page_versions', { page_id: page.id, blocks: JSON.stringify(blocks), note: `criada do modelo ${template.id} v${template.version}`, created_by: userId || null });
  });
  return site;
}

export function audit(db, { tenantId = null, userId = null, action, target = null, data = {} }) {
  db.prepare('INSERT INTO audit (id, tenant_id, user_id, action, target, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(newId(), tenantId, userId, action, target, JSON.stringify(data), now());
}

export const publicTenant = (t) => t && ({ id: t.id, slug: t.slug, name: t.name, number: t.number, niche: t.niche_id, edition: t.edition || 'geral', label: unitLabel(t.niche_id, t.number),
  settings: parse(t.settings, {}), modules: parse(t.modules, []), limits: parse(t.limits, {}), status: t.status, demo: Boolean(t.demo), createdAt: t.created_at });
