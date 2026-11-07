// Galeria de modelos (Sites e páginas → Novo site, e o passo "modelo" ao criar uma operação): cada modelo abre uma demo navegável,
// montada na hora a partir do JSON do modelo, sem criar nada no banco. Fora do Google (noindex) e só para quem está logado.
//   /api/modelos/:id/demo/*              dados de exemplo do nicho (criação de operação, ainda sem dados)
//   /api/t/:tenant/modelos/:id/demo/*    com o nome, o clube e os links da operação e, com torneios ligados, a grade ao vivo da liga
// As miniaturas ficam em public/admin/modelos/<id>.jpg (gerar com: node portal/tools/fotos-homes.mjs --miniaturas).
import { HttpError } from '../http.mjs';
import { parse } from '../db.mjs';
import { loadTemplates, fillPlaceholders, cleanTheme } from '../templates.mjs';
import { templateVars } from '../tenants.mjs';
import { cleanBlocks } from '../blocks.mjs';
import { renderPage } from '../site.mjs';

// dados fictícios por nicho, só para a demo (os mesmos das fotos das homes)
export const EXEMPLO = {
  poker: { name: 'Clube 123123', number: '123123', settings: { app: 'Suprema Poker', agentId: '000000', whatsapp: '5511900000000', tagline: 'Mesas 24h, fichas na hora e suporte de verdade.' } },
  loja: { name: 'Loja Exemplo', number: '', settings: { coupon: 'BEMVINDO10', tagline: 'Ofertas conferidas todo dia.' } },
  criador: { name: 'Canal Exemplo', number: '', settings: { tagline: 'Conteúdo, comunidade e eventos.' } },
  saas: { name: 'App Exemplo', number: '', settings: { product: 'CRM para clínicas', tagline: 'Teste grátis por 14 dias.' } },
};

function modeloDaEdicao(edition, id) {
  const t = loadTemplates().get(String(id || ''));
  if (!t || !(t.niches.includes('*') || t.niches.some((n) => edition.allowsNiche(n)))) throw new HttpError(404, 'Modelo não encontrado.');
  return t;
}

/** HTML de uma página do modelo, preenchido com os dados da operação (ou de exemplo). Exportada para os testes e as miniaturas. */
export async function demoDoModelo(app, { template, tenant, rest = '', base, faixa }) {
  const slug = String(rest || '').replace(/^\/+|\/+$/g, '');
  const pg = template.pages.find((p) => p.slug === slug);
  if (!pg) return null;
  const settings = parse(tenant.settings, {}) || {};
  const vars = templateVars(tenant, settings);
  const site = { id: 'demo', slug: 'demo', name: tenant.name, theme: JSON.stringify(cleanTheme(template.theme)), tracking: '{}',
    seo: JSON.stringify(fillPlaceholders(template.seo || { title: '{{name}}', description: '{{tagline}}' }, vars)) };
  const pages = template.pages.map((p, position) => ({ id: `demo-${p.slug || 'inicio'}`, slug: p.slug, title: fillPlaceholders(p.title, vars), position, published: '[]' }));
  const page = { ...pages.find((p) => p.slug === slug), seo: JSON.stringify({ ...fillPlaceholders(pg.seo || {}, vars), noindex: true }) };
  const blocks = await (app.prontos ? app.prontos(tenant, cleanBlocks(fillPlaceholders(pg.blocks, vars))) : cleanBlocks(fillPlaceholders(pg.blocks, vars)));
  return renderPage({ site, page, blocks, tenant, base, origin: '', pages, faixa });
}

const resposta = (app, html) => (html === null
  ? { status: 404, body: 'Página não encontrada neste modelo.', headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
  : { status: 200, body: html, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': app.siteCsp || "frame-ancestors 'self'", 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });

export const routes = [
  {
    method: 'GET', path: '/api/modelos/:id/demo/*', handler: async ({ app, edition, params }) => {
      const template = modeloDaEdicao(edition, params.id);
      const nicho = template.niches.find((n) => EXEMPLO[n]) || (template.niches.includes('poker') ? 'poker' : 'loja');
      const ex = EXEMPLO[nicho] || EXEMPLO.loja;
      const tenant = { id: 'demo', slug: 'demo', name: ex.name, number: ex.number, niche_id: template.niches.includes('*') ? 'loja' : template.niches[0], settings: JSON.stringify(ex.settings), demo: 1, edition: edition.id };
      return resposta(app, await demoDoModelo(app, { template, tenant, rest: params.rest, base: `/api/modelos/${encodeURIComponent(template.id)}/demo`,
        faixa: `Demonstração do modelo ${template.name}: dados de exemplo. Nada disto está publicado.` }));
    },
  },
  {
    method: 'GET', path: '/api/t/:tenant/modelos/:id/demo/*', perm: 'site.read', handler: async ({ app, edition, params, tenant }) => {
      const template = modeloDaEdicao(edition, params.id);
      if (!template.niches.includes('*') && !template.niches.includes(tenant.niche_id)) throw new HttpError(404, 'Modelo não encontrado.');
      return resposta(app, await demoDoModelo(app, { template, tenant, rest: params.rest, base: `/api/t/${encodeURIComponent(tenant.slug)}/modelos/${encodeURIComponent(template.id)}/demo`,
        faixa: `Demonstração do modelo ${template.name} com os dados de ${tenant.name}. Nada disto está publicado.` }));
    },
  },
];
