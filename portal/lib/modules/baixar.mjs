// /baixar inteligente em cada site: um link só, e cada aparelho vai para o lugar certo (como no suprema.blog).
//   iPhone/iPad      -> baixarIos      (ou o link de convite do clube, inviteLink)
//   Android          -> baixarAndroid  (ou inviteLink)
//   Android sem loja -> baixarApk      (aparelhos sem Google Play, como Huawei/HarmonyOS, ou ?apk=1), senão o Android acima
//   Windows          -> baixarWindows  (instalador), senão inviteLink
//   Outros (Mac, Linux, robôs) -> inviteLink
// Sem link nenhum configurado, volta para a página inicial do site. Com ?l=<id do lead> registra o clique no histórico do lead.
import { HttpError } from '../http.mjs';
import { parse } from '../db.mjs';
import { gravarSettings } from './torneios.mjs';

export const CHAVES = { ios: 'baixarIos', android: 'baixarAndroid', windows: 'baixarWindows', apk: 'baixarApk' };

/** Só https vale como destino (nada de javascript:, data: ou http). */
export function linkSeguro(v) {
  const s = String(v ?? '').trim();
  if (!s || s.length > 500) return '';
  try { const u = new URL(s); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
}

/** Aparelho a partir do User-Agent: ios | android | android_sem_loja | windows | outro. */
export function aparelho(userAgent, { apk = false } = {}) {
  const ua = String(userAgent || '');
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android|harmonyos/i.test(ua)) return apk || /harmonyos|hmscore|huaweibrowser/i.test(ua) ? 'android_sem_loja' : 'android';
  if (/windows/i.test(ua)) return 'windows';
  return 'outro';
}

/** Links da operação (só os válidos). */
export function linksBaixar(tenant) {
  const s = parse(tenant?.settings, {}) || {};
  return { convite: linkSeguro(s.inviteLink), ios: linkSeguro(s.baixarIos), android: linkSeguro(s.baixarAndroid), windows: linkSeguro(s.baixarWindows), apk: linkSeguro(s.baixarApk) };
}

/** Destino do /baixar para o aparelho ('' = sem link, volta para a home). */
export function destino(links, tipo) {
  if (tipo === 'ios') return links.ios || links.convite;
  if (tipo === 'android') return links.android || links.convite;
  if (tipo === 'android_sem_loja') return links.apk || links.android || links.convite;
  if (tipo === 'windows') return links.windows || links.convite;
  return links.convite;
}

function baixar({ req, res, send, tenant, repo, base }) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const url = new URL(req.url, 'http://local');
  const tipo = aparelho(req.headers['user-agent'], { apk: url.searchParams.get('apk') === '1' });
  const alvo = destino(linksBaixar(tenant), tipo) || `${base}/`;
  const lead = String(url.searchParams.get('l') || '');
  if (/^[0-9a-f-]{36}$/.test(lead)) {
    try {
      if (repo.get('leads', lead)) repo.insert('lead_events', { lead_id: lead, kind: 'baixar', data: JSON.stringify({ aparelho: tipo }) });
    } catch (e) { console.error('[baixar] histórico do lead:', e.message); }
  }
  return send(res, 302, '', { Location: alvo, 'Cache-Control': 'no-store', Vary: 'User-Agent', 'X-Robots-Tag': 'noindex' });
}

export const publicRoutes = [{ path: '/baixar', handler: baixar }];

export const routes = [
  {
    method: 'PUT', path: '/api/t/:tenant/baixar/config', perm: 'tenant.manage', handler: ({ db, tenant, body, audit }) => {
      const patch = {};
      for (const [k, chave] of Object.entries(CHAVES)) {
        const bruto = String(body?.[k] ?? '').trim();
        const ok = linkSeguro(bruto);
        if (bruto && !ok) throw new HttpError(400, `Link de ${{ ios: 'iPhone', android: 'Android', windows: 'Windows', apk: 'APK' }[k]} inválido: use um endereço https://`);
        patch[chave] = ok;
      }
      const settings = gravarSettings(db, tenant, patch);
      audit('baixar.config', tenant.id, { links: Object.keys(CHAVES).filter((k) => patch[CHAVES[k]]) });
      return { baixar: linksBaixar({ settings: JSON.stringify(settings) }) };
    },
  },
];
