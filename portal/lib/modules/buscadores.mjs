// Buscadores verificados fora do portal (Google Search Console e Bing Webmaster Tools): o superadministrador registra
// a verificação feita no próprio serviço (método, conta, sitemap enviado), e a integração passa a mostrar o estado real.
// Não guarda senha nem token: a leitura de relatórios pela API continua sendo outra integração.
import { HttpError } from '../http.mjs';
import { now } from '../db.mjs';

const KINDS = { google_search_console: 'Google Search Console', bing_webmaster: 'Bing Webmaster Tools' };
const txt = (v, max) => String(v ?? '').trim().slice(0, max);

export const routes = [
  {
    method: 'PUT', path: '/api/t/:tenant/integrations/:kind/verificado', super: true, handler: ({ repo, params, body, audit }) => {
      const kind = String(params.kind);
      if (!KINDS[kind]) throw new HttpError(400, 'Só Google Search Console e Bing Webmaster Tools são registrados assim.');
      const row = repo.get('integrations', { kind });
      if (!row) throw new HttpError(404, 'Integração não encontrada nesta operação.');
      const verificado = body?.verificado !== false;
      const cfg = verificado ? {
        verificado: true, metodo: txt(body?.metodo, 80) || 'registro DNS', conta: txt(body?.conta, 120), propriedade: txt(body?.propriedade, 200),
        sitemap: txt(body?.sitemap, 300), verificadoEm: txt(body?.verificadoEm, 30) || now().slice(0, 10),
        nota: 'Verificado no próprio serviço. Relatórios pela API ainda não estão ligados.',
      } : {};
      repo.update('integrations', row.id, { status: verificado ? 'ativo' : 'pendente', public_config: JSON.stringify(cfg), last_check: now(), last_error: null });
      audit('buscador.verificado', kind, { verificado, metodo: cfg.metodo || null });
      return { ok: true, kind, label: KINDS[kind], status: verificado ? 'ativo' : 'pendente', config: cfg };
    },
  },
];
