// Calendário editorial: horários da operação, geração idempotente dos espaços do dia e situação real de cada publicação.
// Nada é publicado aqui. Sem conta conectada o espaço fica "aguardando conexão"; quem publica é o módulo do canal,
// que marca "publicado" ou "erro" pelos ajudantes marcarPublicado/marcarErro.
import { parse } from '../db.mjs';
import { HttpError } from '../http.mjs';
import { cleanSettings } from '../tenants.mjs';

export const tables = ['calendar'];
export const nav = { id: 'calendar', label: 'Calendário e agenda', perm: 'calendar.read' };

/** As cinco situações de um espaço do calendário. */
export const STATUSES = {
  rascunho: 'Rascunho',
  aguardando_conexao: 'Aguardando conexão',
  agendado: 'Agendado',
  publicado: 'Publicado',
  erro: 'Erro',
};
const FECHADOS = ['publicado', 'erro'];   // histórico: a geração nunca mexe nestes

export const CHANNELS = {
  instagram: { label: 'Instagram', integration: 'instagram' },
  telegram: { label: 'Telegram', integration: 'telegram' },
  youtube: { label: 'YouTube', integration: 'youtube' },
  blog: { label: 'Blog do site', integration: null },  // sai no próprio portal, não depende de conta de fora
};
const CANAIS_PADRAO = ['instagram'];
const FUSO_PADRAO = 'America/Sao_Paulo';
const MAX_DIAS = 60;
const MAX_HORARIOS = 12;

const need = (condicao, status, mensagem) => { if (!condicao) throw new HttpError(status, mensagem); };

// ---------------------------------------------------------------- fuso da operação (sem dependências)

const pad = (n) => String(n).padStart(2, '0');

export function fusoValido(timezone) {
  try { new Intl.DateTimeFormat('en-CA', { timeZone: String(timezone) }); return true; } catch { return false; }
}

function partesNoFuso(timezone, date) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return Object.fromEntries(f.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
}

/** Quanto o relógio do fuso está à frente do UTC naquele instante (em ms, já contando horário de verão). */
export function deslocamentoMs(timezone, date) {
  const p = partesNoFuso(timezone, date);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** Dia do calendário no relógio da operação, em AAAA-MM-DD. */
export function diaLocal(timezone, date = new Date()) {
  const p = partesNoFuso(timezone, date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Hora no relógio da operação (HH:MM) de um instante. */
export function horaLocal(timezone, date) {
  const p = partesNoFuso(timezone, date);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Soma dias no calendário (não em 24 h), para o dia local não escorregar em mudança de horário de verão. */
export function somarDias(dia, n) {
  const [y, m, d] = dia.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Instante exato (UTC) de um horário escrito no relógio da operação. A segunda passada resolve horário de verão. */
export function instanteLocal(timezone, dia, hhmm) {
  const [y, m, d] = dia.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const alvo = Date.UTC(y, m - 1, d, hh, mm, 0);
  let ts = alvo - deslocamentoMs(timezone, new Date(alvo));
  ts = alvo - deslocamentoMs(timezone, new Date(ts));
  return new Date(ts);
}

// ---------------------------------------------------------------- configuração de horários

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "12:00, 15:00 , 12:00" → ['12:00', '15:00'] (sem repetidos, em ordem). */
export function lerHorarios(texto) {
  const lista = String(texto ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  const fora = lista.find((x) => !HORA.test(x));
  if (fora) throw new HttpError(400, `Horário inválido: "${fora}". Use HH:MM, de 00:00 a 23:59, separados por vírgula.`);
  return [...new Set(lista)].sort();
}

/** Configuração efetiva do calendário desta operação, já com os limites aplicados. */
export function calendarConfig(tenant) {
  const s = parse(tenant?.settings, {}) || {};
  const timezone = fusoValido(s.timezone) ? String(s.timezone) : FUSO_PADRAO;
  const postsPerDay = Math.max(0, Math.min(MAX_HORARIOS, Number(s.postsPerDay ?? 3) || 0));
  let horarios = [];
  try { horarios = lerHorarios(s.postTimes ?? '12:00,15:00,18:00'); } catch { horarios = []; }
  const canais = (Array.isArray(s.postChannels) ? s.postChannels : CANAIS_PADRAO).filter((c) => CHANNELS[c]);
  return { timezone, postsPerDay, postTimes: horarios.slice(0, postsPerDay), canais: canais.length ? canais : CANAIS_PADRAO };
}

/** Avisos honestos para a tela: o que impede a meta de publicações do dia. */
export function avisosDaConfig(cfg, conexoes) {
  const avisos = [];
  if (!cfg.postsPerDay) avisos.push('A meta é de 0 publicações por dia: nenhum espaço será criado.');
  else if (cfg.postTimes.length < cfg.postsPerDay) {
    avisos.push(`A meta é de ${cfg.postsPerDay} publicações por dia, mas só há ${cfg.postTimes.length} horário(s) configurado(s). Acrescente horários para fechar a meta.`);
  }
  const semConta = cfg.canais.filter((c) => !conexoes[c]);
  if (semConta.length) avisos.push(`Sem conta conectada em ${semConta.map((c) => CHANNELS[c].label).join(', ')}: os espaços ficam aguardando conexão e nada é publicado.`);
  return avisos;
}

// ---------------------------------------------------------------- conexão real de cada canal

/** Canal por canal: a conta está conectada de verdade? (integração 'ativo'; o blog sai no próprio portal) */
export function conexoesDosCanais(repo) {
  const out = {};
  for (const [canal, def] of Object.entries(CHANNELS)) {
    out[canal] = def.integration ? repo.get('integrations', { kind: def.integration })?.status === 'ativo' : true;
  }
  return out;
}

const situacaoDesejada = (atual, conectado) => {
  if (FECHADOS.includes(atual)) return atual;
  if (!conectado) return 'aguardando_conexao';
  return atual === 'aguardando_conexao' ? 'rascunho' : atual;
};

// ---------------------------------------------------------------- geração idempotente

/** Chave única do espaço: canal + dia local + horário. Rodar de novo cai na mesma chave e não duplica. */
export const chaveDoEspaco = (canal, dia, hora) => `cal|${canal}|${dia}|${hora}`;

/**
 * Cria os espaços que faltam nos próximos dias e reavalia a situação dos que já existem.
 * Idempotente: a mesma chave nunca vira dois itens; "publicado" e "erro" não são tocados.
 */
export function ensureSlots(repo, tenant, { days = 14, from = new Date() } = {}) {
  const cfg = calendarConfig(tenant);
  const conexoes = conexoesDosCanais(repo);
  const dias = Math.max(1, Math.min(MAX_DIAS, Number(days) || 14));
  const resumo = { criados: 0, mantidos: 0, reavaliados: 0, remarcados: 0, dias, horarios: cfg.postTimes.length, canais: cfg.canais.length };
  if (!cfg.postTimes.length || !cfg.canais.length) return resumo;

  const hoje = diaLocal(cfg.timezone, from);
  for (let i = 0; i < dias; i++) {
    const dia = somarDias(hoje, i);
    for (const hora of cfg.postTimes) {
      for (const canal of cfg.canais) {
        const idemKey = chaveDoEspaco(canal, dia, hora);
        const quando = instanteLocal(cfg.timezone, dia, hora).toISOString();
        const atual = repo.get('calendar', { idem_key: idemKey });
        if (!atual) {
          repo.insert('calendar', { channel: canal, scheduled_at: quando, caption: '',
            status: conexoes[canal] ? 'rascunho' : 'aguardando_conexao', idem_key: idemKey });
          resumo.criados++;
          continue;
        }
        const patch = {};
        const alvo = situacaoDesejada(atual.status, conexoes[canal]);
        if (alvo !== atual.status) patch.status = alvo;
        if (!FECHADOS.includes(atual.status) && atual.scheduled_at !== quando) patch.scheduled_at = quando; // mudou o fuso
        if (!Object.keys(patch).length) { resumo.mantidos++; continue; }
        repo.update('calendar', atual.id, patch);
        if (patch.status) resumo.reavaliados++;
        if (patch.scheduled_at) resumo.remarcados++;
      }
    }
  }
  return resumo;
}

// ---------------------------------------------------------------- ajudantes para o módulo que publica

/** Só o módulo do canal chama: a publicação saiu de verdade. */
export function marcarPublicado(repo, id) {
  const item = repo.get('calendar', String(id));
  need(item, 404, 'Item do calendário não encontrado.');
  return repo.update('calendar', item.id, { status: 'publicado', last_error: null });
}

/** Só o módulo do canal chama: a publicação falhou. A mensagem nunca leva segredo. */
export function marcarErro(repo, id, mensagem) {
  const item = repo.get('calendar', String(id));
  need(item, 404, 'Item do calendário não encontrado.');
  return repo.update('calendar', item.id, { status: 'erro', last_error: String(mensagem || 'Falha ao publicar.').slice(0, 500) });
}

// ---------------------------------------------------------------- saída para a tela

const itemOut = (c, timezone) => ({
  id: c.id, canal: c.channel, canalLabel: CHANNELS[c.channel]?.label || c.channel,
  dia: diaLocal(timezone, new Date(c.scheduled_at)), hora: horaLocal(timezone, new Date(c.scheduled_at)),
  quando: c.scheduled_at, legenda: c.caption || '', criativoId: c.creative_id || null,
  situacao: c.status, situacaoLabel: STATUSES[c.status] || c.status, erro: c.last_error || null,
});

// ---------------------------------------------------------------- rotas do painel

export const routes = [
  {
    method: 'GET', path: '/api/t/:tenant/calendar', perm: 'calendar.read',
    handler: ({ repo, tenant, query }) => {
      const cfg = calendarConfig(tenant);
      const dias = Math.max(1, Math.min(MAX_DIAS, Number(query.dias) || 14));
      const conexoes = conexoesDosCanais(repo);
      const hoje = diaLocal(cfg.timezone);
      const desde = instanteLocal(cfg.timezone, hoje, '00:00').toISOString();
      const ate = instanteLocal(cfg.timezone, somarDias(hoje, dias), '00:00').toISOString();
      const itens = repo.all('calendar', {}, { order: 'scheduled_at ASC', limit: 2000,
        extra: 'scheduled_at >= ? AND scheduled_at < ?', extraParams: [desde, ate] }).map((c) => itemOut(c, cfg.timezone));
      const porDia = new Map([...Array(dias)].map((_, i) => [somarDias(hoje, i), []]));
      for (const it of itens) {
        if (!porDia.has(it.dia)) porDia.set(it.dia, []);
        porDia.get(it.dia).push(it);
      }
      return {
        config: { ...cfg, postTimesTexto: cfg.postTimes.join(', ') },
        canais: Object.entries(CHANNELS).map(([id, c]) => ({ id, label: c.label, integracao: c.integration, conectado: conexoes[id] })),
        situacoes: STATUSES, conexoes, avisos: avisosDaConfig(cfg, conexoes),
        dias: [...porDia].map(([dia, lista]) => ({ dia, itens: lista })),
      };
    },
  },
  {
    method: 'PUT', path: '/api/t/:tenant/calendar/config', perm: 'calendar.edit',
    handler: ({ db, repo, tenant, body, audit }) => {
      const atual = parse(tenant.settings, {});
      const timezone = body.timezone == null ? (atual.timezone || FUSO_PADRAO) : String(body.timezone).trim();
      need(fusoValido(timezone), 400, 'Fuso horário desconhecido. Use um nome da lista IANA, como America/Sao_Paulo.');
      const horarios = lerHorarios(body.postTimes == null ? (atual.postTimes ?? '12:00,15:00,18:00') : body.postTimes);
      need(horarios.length <= MAX_HORARIOS, 400, `No máximo ${MAX_HORARIOS} horários por dia.`);
      const porDia = Number(body.postsPerDay == null ? (atual.postsPerDay ?? 3) : body.postsPerDay);
      need(Number.isInteger(porDia) && porDia >= 0 && porDia <= MAX_HORARIOS, 400, `Publicações por dia: um número inteiro de 0 a ${MAX_HORARIOS}.`);
      need(body.channels == null || Array.isArray(body.channels), 400, 'Canais: envie uma lista.');
      const canais = [...new Set(body.channels ?? (Array.isArray(atual.postChannels) ? atual.postChannels : CANAIS_PADRAO))];
      const desconhecido = canais.find((c) => !CHANNELS[c]);
      need(!desconhecido, 400, `Canal desconhecido: ${desconhecido}. Use ${Object.keys(CHANNELS).join(', ')}.`);
      need(canais.length, 400, 'Escolha pelo menos um canal para o calendário.');

      const base = { ...atual, timezone, postTimes: horarios.join(','), postsPerDay: porDia };
      // postsPerDay depois do cleanSettings: lá o 0 vira 3 (`Number(0) || 3`), e "nenhuma publicação por dia" é uma escolha válida.
      const novas = { ...atual, ...cleanSettings(tenant.niche_id, base), postChannels: canais, postsPerDay: porDia };
      db.prepare('UPDATE tenants SET settings = ? WHERE id = ?').run(JSON.stringify(novas), tenant.id);
      audit('calendario.config', tenant.id, { fuso: timezone, porDia, horarios: horarios.length, canais });
      const cfg = calendarConfig({ settings: JSON.stringify(novas) });
      return { config: { ...cfg, postTimesTexto: cfg.postTimes.join(', ') }, avisos: avisosDaConfig(cfg, conexoesDosCanais(repo)),
        nota: 'Horários salvos. Gere os espaços para o calendário acompanhar a configuração nova.' };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/calendar/gerar', perm: 'calendar.edit',
    handler: ({ repo, tenant, body, audit }) => {
      const resumo = ensureSlots(repo, tenant, { days: body.dias });
      audit('calendario.gerar', tenant.id, resumo);
      return { ...resumo, nota: resumo.criados || resumo.reavaliados || resumo.remarcados
        ? 'Espaços do calendário em dia. Nada foi publicado.'
        : 'Nada a fazer: os espaços destes dias já existiam.' };
    },
  },
  {
    method: 'PATCH', path: '/api/t/:tenant/calendar/:id', perm: 'calendar.edit',
    handler: ({ repo, tenant, params, body, audit }) => {
      const item = repo.get('calendar', String(params.id));
      need(item, 404, 'Item do calendário não encontrado.');
      need(item.status !== 'publicado', 409, 'Este item já foi publicado: não dá para alterar.');
      const patch = {};
      if (body.legenda != null) patch.caption = String(body.legenda).slice(0, 5000);
      if (body.criativoId !== undefined) patch.creative_id = body.criativoId ? String(body.criativoId).slice(0, 80) : null;
      need(Object.keys(patch).length, 400, 'Nada para alterar: envie legenda ou criativoId.');
      const novo = repo.update('calendar', item.id, patch);
      audit('calendario.editar', item.id, { campos: Object.keys(patch) });
      return { item: itemOut(novo, calendarConfig(tenant).timezone) };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/calendar/:id/situacao', perm: 'calendar.edit',
    handler: ({ repo, tenant, params, body, audit }) => {
      const item = repo.get('calendar', String(params.id));
      need(item, 404, 'Item do calendário não encontrado.');
      need(item.status !== 'publicado', 409, 'Este item já foi publicado: a situação não muda mais.');
      const alvo = String(body.situacao || '');
      need(['rascunho', 'agendado'].includes(alvo), 400, 'Aqui só dá para voltar para rascunho ou agendar. Publicar é do módulo do canal.');
      if (alvo === 'agendado') {
        need(String(item.caption || '').trim(), 400, 'Escreva a legenda antes de agendar.');
        need(conexoesDosCanais(repo)[item.channel], 400, `Conecte a conta de ${CHANNELS[item.channel]?.label || item.channel} em Integrações antes de agendar.`);
      }
      const novo = repo.update('calendar', item.id, { status: alvo, last_error: null });
      audit('calendario.situacao', item.id, { de: item.status, para: alvo });
      return { item: itemOut(novo, calendarConfig(tenant).timezone) };
    },
  },
  {
    method: 'DELETE', path: '/api/t/:tenant/calendar/:id', perm: 'calendar.edit',
    handler: ({ repo, params, audit }) => {
      const item = repo.get('calendar', String(params.id));
      need(item, 404, 'Item do calendário não encontrado.');
      need(item.status !== 'publicado', 409, 'Este item já foi publicado: fica no histórico.');
      repo.remove('calendar', item.id);
      audit('calendario.apagar', item.id, { canal: item.channel, quando: item.scheduled_at });
      return { ok: true, nota: 'Espaço removido. Ele volta a aparecer na próxima geração, se o horário continuar na configuração.' };
    },
  },
];
