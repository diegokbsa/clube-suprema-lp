// Sobe um portal em memória numa porta livre e devolve um cliente HTTP com cookie e CSRF por usuário.
import http from 'node:http';
import { openDb } from '../lib/db.mjs';
import { createApp } from '../server.mjs';
import { createUser, hmac } from '../lib/auth.mjs';

export async function startPortal() {
  const db = openDb(':memory:');
  const server = http.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const { handle, app } = await createApp({ db, origin, secretKey: 'teste' });
  server.on('request', handle);
  const superUser = createUser(db, { email: 'super@teste.local', name: 'Super', password: 'senha-forte-123', isSuper: true });
  return { db, app, origin, superUser, close: () => new Promise((r) => server.close(r)) };
}

export function client(origin) {
  let cookie = '';
  let csrf = '';
  const req = async (method, path, body, { headers = {}, raw = false, redirect = 'manual' } = {}) => {
    const h = { Accept: 'application/json', ...headers };
    if (cookie) h.Cookie = cookie;
    if (csrf && method !== 'GET') h['X-CSRF'] = csrf;
    let payload;
    if (body !== undefined) {
      if (typeof body === 'string' || body instanceof URLSearchParams) payload = body.toString();
      else { payload = JSON.stringify(body); h['Content-Type'] ??= 'application/json'; }
    }
    const r = await fetch(origin + path, { method, headers: h, body: payload, redirect });
    const set = r.headers.getSetCookie?.() || [];
    for (const c of set) {
      const [pair] = c.split(';');
      const [k] = pair.split('=');
      cookie = [...cookie.split('; ').filter((x) => x && !x.startsWith(`${k}=`)), pair].join('; ');
    }
    const text = await r.text();
    let data = text;
    if (!raw) { try { data = JSON.parse(text); } catch { /* html */ } }
    return { status: r.status, data, headers: r.headers };
  };
  return {
    req,
    get cookie() { return cookie; },
    async login(email, password) {
      const r = await req('POST', '/api/login', { email, password });
      if (r.status !== 200) throw new Error(`login falhou: ${r.status} ${JSON.stringify(r.data)}`);
      csrf = r.data.csrf;
      return r;
    },
  };
}

export const sign = (secret, body) => `sha256=${hmac(secret, body)}`;
