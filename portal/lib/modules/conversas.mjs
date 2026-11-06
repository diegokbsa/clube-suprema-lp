// CRM de conversas: caixa de entrada por operação (PA-120).
// Organização inspirada no DeskcommCRM (licença MIT): conversa com status e atendente, linha do tempo de mensagens
// e notas internas. Nenhum trecho de código de lá foi copiado.
//
// O que vale aqui:
//   - Isolamento: tudo passa por ctx.repo, então a conversa de uma operação não existe para outra.
//   - Base única: a mensagem acha a pessoa por e-mail/telefone (contacts) e a conversa guarda contact_id e lead_id.
//   - Idempotência: (operação, canal, id externo) é único; reenviar a mesma mensagem devolve 200 com duplicada: true.
//   - Estado real: o painel não envia nada. Resposta escrita aqui fica "pendente de envio" até existir integração do canal.
import { scoped } from '../repo.mjs';
import { HttpError, rateLimiter, clientIp } from '../http.mjs';
import { can, hmac, mask, safeEqualHex } from '../auth.mjs';
import { normEmail, normPhone, upsertContact } from '../migrations.mjs';
import { audit as writeAudit } from '../tenants.mjs';
import { now, parse } from '../db.mjs';

export const tables = ['conversations', 'messages', 'conversation_events'];
export const nav = { id: 'conversas', label: 'Conversas', perm: 'leads.read' };

export const STATUS = ['aberta', 'aguardando', 'resolvida'];
export const CHANNELS = ['whatsapp', 'telegram', 'email', 'site', 'manual'];
const DIRECTIONS = ['entrada', 'saida', 'nota'];
const TEXTO_MAX = 4000;
const CANAL_INTEGRACAO = { whatsapp: 'whatsapp', telegram: 'telegram', email: 'email' };
const SECRET_LABEL = 'portal:hook:mensagens:v1';

const need = (condition, status, message) => { if (!condition) throw new HttpError(status, message); };
const texto = (v, max = TEXTO_MAX) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
const resumo = (v) => texto(v, 160).replace(/\s+/g, ' ');
const like = (q) => `%${String(q || '').trim().toLowerCase().replace(/[%_]/g, '').slice(0, 60)}%`;
const dataValida = (v) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : now());

const hookLimit = rateLimiter(600, 60_000);

// ---------- equipe de atendimento ----------
const atendentesDa = (db, tenantId) => db.prepare(`
  SELECT u.id, u.name, m.role FROM memberships m JOIN users u ON u.id = m.user_id
  WHERE m.tenant_id = ? AND m.role IN ('admin', 'marketing')
  ORDER BY u.name COLLATE NOCASE, u.id`).all(tenantId);

function validarAtendente(db, tenantId, ownerId) {
  if (!ownerId) return null;
  const m = db.prepare("SELECT 1 FROM memberships WHERE user_id = ? AND tenant_id = ? AND role IN ('admin', 'marketing')").get(ownerId, tenantId);
  need(m, 400, 'O atendente deve ser administrador ou marketing desta operação.');
  return ownerId;
}

// ---------- leitura ----------
const verCliente = (lead, conversa) => lead ? {
  id: lead.contact_id, nome: lead.name, email: lead.email, telefone: lead.phone,
} : (conversa && (conversa.contact_name || conversa.contact_email || conversa.contact_phone) ? {
  id: conversa.contact_id, nome: conversa.contact_name, email: conversa.contact_email, telefone: conversa.contact_phone,
} : null);

const verConversa = (c, lead) => ({
  id: c.id, canal: c.channel, assunto: c.subject, status: c.status, atendente: c.owner_id, leadId: c.lead_id,
  naoLidas: c.unread, mensagens: c.messages, ultimaEm: c.last_message_at, ultima: c.last_message_preview,
  ultimaDirecao: c.last_direction, criadaEm: c.created_at, idExterno: c.external_id, cliente: verCliente(lead, c),
});

const verMensagem = (m) => ({
  id: m.id, direcao: m.direction, canal: m.channel, texto: m.body, status: m.status, interna: m.direction === 'nota',
  autor: m.author_name, autorId: m.author_user, quando: m.occurred_at, idExterno: m.external_id,
});

const verEvento = (e) => ({ id: e.id, tipo: e.kind, dados: parse(e.data, {}), por: e.by_user, quando: e.created_at });

// ---------- escrita ----------
function leadDoContato(repo, contactId) {
  if (!contactId) return null;
  return repo.all('leads', { contact_id: contactId }, { order: 'created_at DESC', limit: 1 })[0] || null;
}

function leadDaConversa(repo, conversa) {
  const lead = conversa.lead_id ? repo.get('leads', conversa.lead_id) : leadDoContato(repo, conversa.contact_id);
  return lead && (!conversa.contact_id || lead.contact_id === conversa.contact_id) ? lead : null;
}

function contatoExistente(db, { email, phone }) {
  const e = normEmail(email);
  const telefone = normPhone(phone);
  let contato = e ? db.prepare('SELECT id FROM contacts WHERE email = ?').get(e) : null;
  if (!contato && telefone) {
    contato = db.prepare('SELECT id FROM contacts WHERE phone = ? AND (email IS NULL OR ? IS NULL) LIMIT 1').get(telefone, e);
  }
  return contato || null;
}

function conversaDaPessoa(repo, { channel, contactId, email, phone }) {
  const where = { channel };
  const condicoes = [];
  const parametros = [];
  if (contactId) { condicoes.push('contact_id = ?'); parametros.push(contactId); }
  if (email) { condicoes.push('contact_email = ?'); parametros.push(email); }
  if (phone) { condicoes.push('contact_phone = ?'); parametros.push(phone); }
  if (!condicoes.length) return null;
  return repo.all('conversations', where, {
    order: 'last_message_at DESC', limit: 1,
    extra: `(${condicoes.join(' OR ')})`, extraParams: parametros,
  })[0] || null;
}

function contatoDaOperacao(repo, db, { contactId, email, phone, name }) {
  if (contactId) {
    const lead = leadDoContato(repo, contactId);
    need(lead, 404, 'Cliente não encontrado nesta operação.');
    return contactId;
  }

  const dados = { email: normEmail(email), phone: normPhone(phone), name: String(name || '').trim().slice(0, 80) || null };
  need(dados.email || dados.phone, 400, 'Informe o e-mail ou o telefone do cliente.');

  const existente = contatoExistente(db, dados);
  const id = existente?.id || upsertContact(db, dados);
  need(id, 400, 'Informe o e-mail ou o telefone do cliente.');
  return id;
}

function dadosLocaisContato(repo, { contactId, email, phone, name }) {
  if (contactId) {
    const lead = leadDoContato(repo, contactId);
    return {
      id: contactId, name: lead?.name || (String(name || '').trim().slice(0, 80) || null),
      email: lead?.email || normEmail(email), phone: lead?.phone || normPhone(phone), leadId: lead?.id || null,
    };
  }
  return {
    id: null,
    name: String(name || '').trim().slice(0, 80) || null,
    email: normEmail(email),
    phone: normPhone(phone),
    leadId: null,
  };
}

function anexarContatoLocal(repo, conversa, contato) {
  if (!contato) return conversa;
  const patch = {};
  if (!conversa.contact_id && contato.id) patch.contact_id = contato.id;
  const mesmoContato = !conversa.contact_id || conversa.contact_id === contato.id;
  if (mesmoContato) {
    if (!conversa.contact_name && contato.name) patch.contact_name = contato.name;
    if (!conversa.contact_email && contato.email) patch.contact_email = contato.email;
    if (!conversa.contact_phone && contato.phone) patch.contact_phone = contato.phone;
    if (!conversa.lead_id && contato.leadId) patch.lead_id = contato.leadId;
  }
  const atualizada = repo.update('conversations', conversa.id, patch);
  return atualizada || conversa;
}

function integracaoDoCanal(repo, channel) {
  const kind = CANAL_INTEGRACAO[channel] || null;
  const status = kind ? (repo.get('integrations', { kind })?.status || 'pendente') : 'pendente';
  return { kind, status, configurada: ['ativo', 'conectado', 'conectada'].includes(status) };
}

export const segredoHookMensagens = (secret) => hmac(secret, SECRET_LABEL);

function leadsDasConversas(repo, conversas) {
  return new Map(conversas.map((conversa) => [conversa.id, leadDaConversa(repo, conversa)]));
}

/**
 * Acha a conversa pelo id externo do canal; senão reaproveita a conversa não resolvida da pessoa naquele canal; senão abre uma.
 * Atendimento resolvido fica resolvido: só volta a abrir se o próprio canal disser que é o mesmo fio (conversa_externa).
 */
function acharOuAbrirConversa(repo, { channel, externalId, contact, subject, ownerId = null }) {
  const contactId = contact?.id || null;
  if (externalId) {
    const porExterno = repo.get('conversations', { channel, external_id: externalId });
    if (porExterno) return { conversa: anexarContatoLocal(repo, porExterno, contact), criada: false };
  }
  if (contactId) {
    const aberta = repo.all('conversations', { contact_id: contactId, channel }, {
      order: 'last_message_at DESC', limit: 1, extra: "status <> 'resolvida'",
    })[0];
    if (aberta) return { conversa: anexarContatoLocal(repo, aberta, contact), criada: false };
  }
  const lead = contact?.leadId ? repo.get('leads', contact.leadId) : leadDoContato(repo, contactId);
  const conversa = repo.insert('conversations', {
    contact_id: contactId || null, lead_id: lead?.id || null,
    contact_name: contact?.name || null, contact_email: contact?.email || null, contact_phone: contact?.phone || null,
    channel, external_id: externalId || null,
    subject: subject ? resumo(subject) : null, status: 'aberta', owner_id: ownerId, unread: 0, messages: 0,
    last_message_at: now(),
  });
  return { conversa, criada: true };
}

function registrarEvento(repo, conversa, kind, dados, userId = null) {
  return repo.insert('conversation_events', { conversation_id: conversa.id, kind, data: JSON.stringify(dados), by_user: userId });
}

/**
 * Grava a mensagem e atualiza o resumo da conversa. Idempotente por (operação, canal, id externo).
 * Entrada reabre conversa resolvida; saída deixa a conversa aguardando o cliente; nota interna não mexe no status.
 */
function registrarMensagem(repo, conversa, { direction, channel, externalId = null, body, authorUser = null, authorName = null, occurredAt, status }) {
  need(DIRECTIONS.includes(direction), 400, 'Direção da mensagem inválida.');
  const corpo = texto(body);
  need(corpo, 400, 'Escreva o texto da mensagem.');
  const canal = channel || conversa.channel;
  const idExterno = externalId ? String(externalId).slice(0, 160) : null;
  if (idExterno) {
    const jaTem = repo.get('messages', { channel: canal, external_id: idExterno });
    if (jaTem) return { criada: false, mensagem: jaTem, conversa: repo.get('conversations', jaTem.conversation_id) || conversa };
  }
  const quando = dataValida(occurredAt);
  let mensagem;
  try {
    mensagem = repo.insert('messages', {
      conversation_id: conversa.id, contact_id: conversa.contact_id || null, direction, channel: canal, external_id: idExterno,
      author_user: authorUser, author_name: authorName ? resumo(authorName) : null, body: corpo,
      status: status || (direction === 'saida' ? 'pendente_envio' : 'registrada'), occurred_at: quando,
    });
  } catch (e) {
    if (/UNIQUE/.test(e.message) && idExterno) {
      const existente = repo.get('messages', { channel: canal, external_id: idExterno });
      if (existente) return { criada: false, mensagem: existente, conversa: repo.get('conversations', existente.conversation_id) || conversa };
    }
    throw e;
  }
  const patch = { messages: (conversa.messages || 0) + 1, last_message_at: quando };
  if (direction !== 'nota') {
    patch.last_message_preview = resumo(corpo);
    patch.last_direction = direction;
  }
  if (direction === 'entrada') {
    patch.unread = (conversa.unread || 0) + 1;
    if (conversa.status === 'resolvida') patch.status = 'aberta';
  }
  if (direction === 'saida' && conversa.status === 'aberta') patch.status = 'aguardando';
  const atualizada = repo.update('conversations', conversa.id, patch) || conversa;
  return { criada: true, mensagem, conversa: atualizada };
}

export const routes = [
  {
    method: 'GET', path: '/api/t/:tenant/conversas/atendentes', perm: 'leads.read',
    handler: ({ db, tenant }) => ({ atendentes: atendentesDa(db, tenant.id) }),
  },
  {
    method: 'GET', path: '/api/t/:tenant/conversas', perm: 'leads.read',
    handler: ({ repo, db, tenant, query, user }) => {
      const status = String(query.status || '').trim();
      need(!status || STATUS.includes(status), 400, 'Status inválido.');
      const canal = String(query.canal || '').trim();
      need(!canal || CHANNELS.includes(canal), 400, 'Canal inválido.');
      const atendente = String(query.atendente || '').trim();
      const busca = String(query.q || '').trim();

      const where = {};
      if (status) where.status = status;
      if (canal) where.channel = canal;
      if (atendente === 'meus') where.owner_id = user.id;
      else if (atendente === 'sem') where.owner_id = null;
      else if (atendente) where.owner_id = atendente;

      let extra = '';
      let extraParams = [];
      if (busca) {
        const alvo = like(busca);
        extra = `id IN (SELECT c.id FROM conversations c
          WHERE c.tenant_id = ? AND (lower(COALESCE(c.subject, '')) LIKE ? OR lower(COALESCE(c.contact_name, '')) LIKE ?
            OR COALESCE(c.contact_email, '') LIKE ? OR COALESCE(c.contact_phone, '') LIKE ? OR EXISTS (
            SELECT 1 FROM leads l WHERE l.tenant_id = c.tenant_id AND l.contact_id = c.contact_id
              AND (l.id = c.lead_id OR c.lead_id IS NULL)
              AND (lower(COALESCE(l.name, '')) LIKE ? OR COALESCE(l.email, '') LIKE ? OR COALESCE(l.phone, '') LIKE ?)
          )))`;
        extraParams = [tenant.id, alvo, alvo, alvo, alvo, alvo, alvo, alvo];
      }
      const rows = repo.all('conversations', where, { order: 'last_message_at DESC', limit: 200, extra, extraParams });
      const leads = leadsDasConversas(repo, rows);
      const totais = Object.fromEntries(STATUS.map((s) => [s, repo.count('conversations', { status: s })]));
      return {
        conversas: rows.map((c) => verConversa(c, leads.get(c.id))),
        atendentes: atendentesDa(db, tenant.id),
        status: STATUS, canais: CHANNELS,
        canaisIntegracao: Object.fromEntries(CHANNELS.map((canal) => [canal, integracaoDoCanal(repo, canal)])),
        totais: {
          ...totais, todas: repo.count('conversations'), semAtendente: repo.count('conversations', { owner_id: null }),
          naoLidas: repo.count('conversations', {}, 'unread > 0'),
        },
      };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/conversas', perm: 'leads.edit',
    handler: ({ repo, db, tenant, body, user, audit }) => {
      const canal = String(body.canal || 'manual').trim();
      need(CHANNELS.includes(canal), 400, 'Canal inválido.');
      const ownerId = validarAtendente(db, tenant.id, body.atendente ? String(body.atendente) : null);
      const dados = {
        contactId: body.contactId ? String(body.contactId) : null,
        email: normEmail(body.email), phone: normPhone(body.telefone), name: body.nome,
      };
      const conhecido = dados.contactId || contatoExistente(db, dados)?.id || null;
      const existente = conversaDaPessoa(repo, { channel: canal, contactId: conhecido, email: dados.email, phone: dados.phone });
      let contato;
      if (existente) {
        contato = dadosLocaisContato(repo, { ...dados, contactId: existente.contact_id || conhecido });
      } else {
        const contatoId = contatoDaOperacao(repo, db, dados);
        contato = dadosLocaisContato(repo, { ...dados, contactId: contatoId });
      }
      const { conversa } = acharOuAbrirConversa(repo, { channel: canal, externalId: null, contact: contato, subject: body.assunto, ownerId });
      registrarEvento(repo, conversa, 'aberta', { canal, por: 'painel' }, user.id);
      const primeira = texto(body.texto);
      let atual = conversa;
      if (primeira) {
        const direcao = DIRECTIONS.includes(String(body.direcao)) ? String(body.direcao) : 'nota';
        atual = registrarMensagem(repo, conversa, { direction: direcao, channel: canal, body: primeira, authorUser: user.id, authorName: user.name }).conversa;
      }
      audit('conversas.abrir', conversa.id, { canal });
      return { status: 201, body: { conversa: verConversa(atual, leadDaConversa(repo, atual)) } };
    },
  },
  {
    method: 'GET', path: '/api/t/:tenant/conversas/hook', perm: 'integrations.read',
    handler: ({ tenant, origin, user, role }) => ({
      url: `${origin}/api/hooks/${tenant.slug}/mensagem`,
      assinatura: 'X-Portal-Signature: sha256=<HMAC-SHA256>',
      segredo: can(user, role, 'integrations.manage') ? mask(segredoHookMensagens(tenant.webhook_secret)) : null,
    }),
  },
  {
    method: 'GET', path: '/api/t/:tenant/conversas/:id', perm: 'leads.read',
    handler: ({ repo, db, params }) => {
      const conversa = repo.get('conversations', params.id);
      need(conversa, 404, 'Conversa não encontrada.');
      const mensagens = repo.all('messages', { conversation_id: conversa.id }, { order: 'occurred_at ASC', limit: 500 });
      const eventos = repo.all('conversation_events', { conversation_id: conversa.id }, { order: 'created_at DESC', limit: 100 });
      const lead = leadDaConversa(repo, conversa);
      return {
        conversa: verConversa(conversa, lead),
        mensagens: mensagens.map(verMensagem),
        eventos: eventos.map(verEvento),
        lead: lead ? { id: lead.id, etapa: lead.stage, pagina: lead.page_slug, criado: lead.created_at } : null,
      };
    },
  },
  {
    method: 'POST', path: '/api/t/:tenant/conversas/:id/mensagens', perm: 'leads.edit',
    handler: ({ repo, db, params, body, user, audit }) => {
      const conversa = repo.get('conversations', params.id);
      need(conversa, 404, 'Conversa não encontrada.');
      const direcao = String(body.direcao || 'saida');
      need(DIRECTIONS.includes(direcao), 400, 'Direção da mensagem inválida.');
      const canal = body.canal ? String(body.canal) : (direcao === 'nota' ? 'manual' : conversa.channel);
      need(CHANNELS.includes(canal), 400, 'Canal inválido.');
      const r = registrarMensagem(repo, conversa, {
        direction: direcao, channel: canal, externalId: body.idExterno || null, body: body.texto,
        authorUser: user.id, authorName: user.name, occurredAt: body.quando,
      });
      audit('conversas.mensagem', conversa.id, { direcao, duplicada: !r.criada });
      return {
        status: r.criada ? 201 : 200,
        body: {
          duplicada: !r.criada, mensagem: verMensagem(r.mensagem), conversa: verConversa(r.conversa, leadDaConversa(repo, r.conversa)),
          aviso: r.criada && direcao === 'saida'
            ? (integracaoDoCanal(repo, canal).configurada
              ? 'Resposta registrada como pendente de envio: a integração está conectada, mas o painel ainda não envia mensagens.'
              : 'Resposta registrada como pendente de envio: o canal ainda não tem integração configurada.')
            : null,
        },
      };
    },
  },
  {
    method: 'PATCH', path: '/api/t/:tenant/conversas/:id', perm: 'leads.edit',
    handler: ({ repo, db, tenant, params, body, user, audit }) => {
      const conversa = repo.get('conversations', params.id);
      need(conversa, 404, 'Conversa não encontrada.');
      const patch = {};
      const mudancas = [];

      if (body.status !== undefined) {
        const status = String(body.status || '');
        need(STATUS.includes(status), 400, 'Status inválido.');
        if (status !== conversa.status) { patch.status = status; mudancas.push(['status', { de: conversa.status, para: status }]); }
      }
      if (body.atendente !== undefined) {
        const ownerId = body.atendente == null ? null : String(body.atendente).trim() || null;
        validarAtendente(db, tenant.id, ownerId);
        if ((ownerId || null) !== (conversa.owner_id || null)) {
          patch.owner_id = ownerId;
          mudancas.push(['atendente', { de: conversa.owner_id || null, para: ownerId }]);
        }
      }
      if (body.assunto !== undefined) {
        const assunto = resumo(body.assunto) || null;
        if (assunto !== (conversa.subject || null)) { patch.subject = assunto; mudancas.push(['assunto', { de: conversa.subject || null, para: assunto }]); }
      }
      if (body.lida === true && conversa.unread) patch.unread = 0;
      const nota = texto(body.nota, 500);
      if (nota && !mudancas.length) mudancas.push(['nota', { nota }]);
      if (nota && mudancas.length) patch.last_message_at = now();

      if (!Object.keys(patch).length) {
        return { conversa: verConversa(conversa, leadDaConversa(repo, conversa)), mudou: false };
      }
      const atualizada = repo.update('conversations', conversa.id, patch);
      for (const [kind, dados] of mudancas) {
        registrarEvento(repo, conversa, kind, { ...dados, ...(nota ? { nota } : {}) }, user.id);
        audit(`conversas.${kind}`, conversa.id, dados);
      }
      return { conversa: verConversa(atualizada, leadDaConversa(repo, atualizada)), mudou: Boolean(mudancas.length) };
    },
  },
  // Entrada de mensagens das integrações (WhatsApp, Telegram, e-mail). Assinada com o segredo da operação, como as conversões.
  // Corpo: { canal, id_externo, texto, conversa_externa?, direcao?, nome?, email?, telefone?, assunto?, quando? }
  {
    method: 'POST', path: '/api/hooks/:op/mensagem', auth: false,
    handler: ({ req, db, params, raw, body }) => {
      const slug = String(params.op || '');
      if (!hookLimit(slug)) throw new HttpError(429, 'limite de eventos por minuto');
      const tenant = db.prepare('SELECT * FROM tenants WHERE slug = ? OR id = ?').get(slug, slug);
      need(tenant, 404, 'operação não encontrada');
      const assinatura = String(req.headers['x-portal-signature'] || '').replace(/^sha256=/, '');
      if (!safeEqualHex(assinatura, hmac(segredoHookMensagens(tenant.webhook_secret), raw))) {
        writeAudit(db, { tenantId: tenant.id, action: 'webhook.assinatura_invalida', data: { ip: clientIp(req), rota: 'mensagem' } });
        throw new HttpError(401, 'assinatura inválida');
      }
      need(tenant.status === 'ativa', 409, 'operação inativa');
      const canal = String(body.canal || 'whatsapp');
      need(CHANNELS.includes(canal), 400, 'canal inválido');
      const idExterno = String(body.id_externo || '').slice(0, 160);
      need(idExterno, 400, 'id_externo é obrigatório');
      const direcao = String(body.direcao || 'entrada');
      need(direcao === 'entrada' || direcao === 'saida', 400, 'direcao deve ser entrada ou saida');
      const corpo = texto(body.texto);
      need(corpo, 400, 'texto é obrigatório');

      const repo = scoped(db, tenant.id);
      const duplicada = repo.get('messages', { channel: canal, external_id: idExterno });
      if (duplicada) return { status: 200, body: { ok: true, duplicada: true, conversa: duplicada.conversation_id, mensagem: duplicada.id } };
      const conversaExterna = body.conversa_externa ? String(body.conversa_externa).slice(0, 160) : null;
      const existente = conversaExterna ? repo.get('conversations', { channel: canal, external_id: conversaExterna }) : null;
      const dadosContato = body.email || body.telefone
        ? dadosLocaisContato(repo, { email: body.email, phone: body.telefone, name: body.nome })
        : null;
      const contact = existente
        ? (existente.contact_id ? dadosLocaisContato(repo, { contactId: existente.contact_id }) : dadosContato)
        : dadosContato;
      need(contact?.id || contact?.email || contact?.phone || existente, 400, 'informe email ou telefone do cliente');
      if (!existente && (body.email || body.telefone)) {
        contact.id = contatoDaOperacao(repo, db, { email: body.email, phone: body.telefone, name: body.nome });
        const local = dadosLocaisContato(repo, { contactId: contact.id, email: body.email, phone: body.telefone, name: body.nome });
        contact.leadId = local.leadId;
      }

      const { conversa, criada } = existente ? { conversa: existente, criada: false }
        : acharOuAbrirConversa(repo, { channel: canal, externalId: conversaExterna, contact, subject: body.assunto });
      if (criada) registrarEvento(repo, conversa, 'aberta', { canal, por: 'integracao' });
      if (contact && !existente?.contact_id) anexarContatoLocal(repo, conversa, contact);
      const r = registrarMensagem(repo, conversa, {
        direction: direcao, channel: canal, externalId: idExterno, body: corpo,
        authorName: body.nome, occurredAt: body.quando, status: 'registrada',
      });
      return { status: r.criada ? 201 : 200, body: { ok: true, duplicada: !r.criada, conversa: r.conversa.id, mensagem: r.mensagem.id } };
    },
  },
];
