// Utilidades HTTP sem framework: rotas com parâmetros, corpo JSON/form, cookies e respostas.
export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function compile(pattern) {
  const keys = [];
  const rx = new RegExp(`^${pattern.replace(/\/:(\w+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }).replace(/\/\*$/, '(?:/(.*))?')}/?$`);
  return (pathname) => {
    const m = rx.exec(pathname);
    if (!m) return null;
    const params = {};
    keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
    if (pattern.endsWith('/*')) params.rest = m[keys.length + 1] || '';
    return params;
  };
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function cookie(name, value, { maxAge, httpOnly = true, secure = false, sameSite = 'Lax', path = '/' } = {}) {
  return [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, maxAge != null ? `Max-Age=${maxAge}` : '', httpOnly ? 'HttpOnly' : '',
    secure ? 'Secure' : '', `SameSite=${sameSite}`].filter(Boolean).join('; ');
}

export function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'Envio grande demais.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export function decodeBody(raw, type = '') {
  if (!raw.length) return {};
  const text = raw.toString('utf8');
  if (type.includes('application/json')) {
    try { return JSON.parse(text); } catch { throw new HttpError(400, 'JSON inválido.'); }
  }
  if (type.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(text));
  return {};
}

export function send(res, status, body, headers = {}) {
  if (res.headersSent) return;
  const isObj = body !== null && typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'Content-Type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}

/** Limite simples em memória: chave -> no máximo `max` eventos por `windowMs`. */
export function rateLimiter(max, windowMs) {
  const hits = new Map();
  return (key) => {
    const t = Date.now();
    const arr = (hits.get(key) || []).filter((x) => t - x < windowMs);
    arr.push(t);
    hits.set(key, arr);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((x) => t - x < windowMs)) hits.delete(k);
    return arr.length <= max;
  };
}

export const clientIp = (req) => String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
