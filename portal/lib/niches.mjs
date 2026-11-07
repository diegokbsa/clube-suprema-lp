// Nichos = configuração, não código. "Clube 10002" vira "Parceiro 10002", "Loja 10002" ou "Criador 10002" trocando o nicho.
// Campos: termos do painel e do site, campos extras da operação, eventos de conversão, regra de comissão padrão e módulos sugeridos.

const BASE_MODULES = ['site', 'blog', 'crm', 'afiliados', 'criativos', 'calendario', 'telegram', 'instagram', 'mensuracao', 'campanhas', 'comissoes'];

export const NICHES = {
  poker: {
    name: 'Poker',
    terms: { unit: 'Clube', units: 'Clubes', customer: 'Jogador', customers: 'Jogadores', number: 'ID do clube', partner: 'Agente', purchase: 'Compra de fichas' },
    fields: [
      { key: 'app', label: 'Aplicativo / plataforma', placeholder: 'Ex.: Suprema Poker' },
      { key: 'agentId', label: 'ID do agente', placeholder: 'Ex.: 1439098' },
      { key: 'inviteLink', label: 'Link de convite do clube', placeholder: 'https://...' },
      { key: 'chipsUrl', label: 'Onde comprar fichas', placeholder: 'https://...' },
      { key: 'chipsHomeUrl', label: 'Página de compra depois do cadastro de fichas (Fichas 24h: /home)', placeholder: 'https://...' },
      { key: 'chipsClubName', label: 'Nome do clube no sistema de fichas (como aparece no "Cadastrar ID")', placeholder: 'Ex.: SX | XX POKER' },
    ],
    conversions: [
      { kind: 'cadastro', label: 'Cadastro no app' },
      { kind: 'entrada_clube', label: 'Entrou no clube' },
      { kind: 'primeiro_deposito', label: 'Primeira compra de fichas' },
      { kind: 'deposito', label: 'Compra de fichas' },
    ],
    commission: { model: 'cpa', cpaEvent: 'primeiro_deposito', cpaCents: 5000, revsharePct: 0, windowDays: 30 },
    templates: ['clube-poker-premium'],
    modules: BASE_MODULES,
    disclaimer: 'Somente maiores de 18 anos. Jogue com responsabilidade.',
  },
  saas: {
    name: 'Software e SaaS',
    terms: { unit: 'Parceiro', units: 'Parceiros', customer: 'Cliente', customers: 'Clientes', number: 'Código do parceiro', partner: 'Afiliado', purchase: 'Assinatura' },
    fields: [
      { key: 'product', label: 'Produto principal', placeholder: 'Ex.: CRM para clínicas' },
      { key: 'trialUrl', label: 'Link do teste grátis', placeholder: 'https://...' },
    ],
    conversions: [
      { kind: 'trial', label: 'Início do teste grátis' },
      { kind: 'assinatura', label: 'Assinatura paga' },
      { kind: 'renovacao', label: 'Renovação' },
    ],
    commission: { model: 'hibrido', cpaEvent: 'assinatura', cpaCents: 3000, revsharePct: 20, windowDays: 60 },
    templates: [],
    modules: BASE_MODULES,
    disclaimer: '',
  },
  loja: {
    name: 'Produtos e colecionáveis',
    terms: { unit: 'Loja', units: 'Lojas', customer: 'Cliente', customers: 'Clientes', number: 'Código da loja', partner: 'Afiliado', purchase: 'Pedido' },
    fields: [
      { key: 'storeUrl', label: 'Endereço da loja', placeholder: 'https://...' },
      { key: 'coupon', label: 'Cupom padrão', placeholder: 'Ex.: BEMVINDO10' },
    ],
    conversions: [
      { kind: 'pedido', label: 'Pedido pago' },
      { kind: 'cadastro', label: 'Cadastro na loja' },
    ],
    commission: { model: 'revshare', cpaEvent: '', cpaCents: 0, revsharePct: 8, windowDays: 30 },
    templates: [],
    modules: BASE_MODULES,
    disclaimer: '',
  },
  criador: {
    name: 'Criadores e streamers',
    terms: { unit: 'Criador', units: 'Criadores', customer: 'Seguidor', customers: 'Seguidores', number: 'Código do criador', partner: 'Parceiro', purchase: 'Compra' },
    fields: [
      { key: 'channel', label: 'Canal principal', placeholder: 'https://twitch.tv/...' },
    ],
    conversions: [
      { kind: 'inscricao', label: 'Inscrição' },
      { kind: 'compra', label: 'Compra pelo link' },
    ],
    commission: { model: 'cpa', cpaEvent: 'compra', cpaCents: 1500, revsharePct: 0, windowDays: 30 },
    templates: [],
    modules: BASE_MODULES,
    disclaimer: '',
  },
};

export function niche(idValue) {
  return NICHES[idValue] || null;
}

/** "Clube 10002", "Parceiro 20001"... */
export function unitLabel(nicheId, number) {
  const n = niche(nicheId);
  return `${n?.terms.unit || 'Operação'}${number ? ` ${number}` : ''}`;
}

export function publicNiches() {
  return Object.entries(NICHES).map(([key, n]) => ({ id: key, name: n.name, terms: n.terms, fields: n.fields, conversions: n.conversions,
    commission: n.commission, modules: n.modules }));
}
