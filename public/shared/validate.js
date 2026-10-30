// Validação usada pela página e pelo servidor (mesmas regras nos dois lados).
// Regras de apelido e senha seguem as do app da Suprema.

export const onlyDigits = (value) => String(value ?? '').replace(/\D/g, '');

export const NICK_RE = /^[A-Za-z0-9]{2,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const PASSWORD_RULES = [
  { key: 'length', label: '6 a 16 caracteres', test: (p) => p.length >= 6 && p.length <= 16 },
  { key: 'upper', label: 'Uma letra maiúscula', test: (p) => /[A-Z]/.test(p) },
  { key: 'number', label: 'Um número', test: (p) => /\d/.test(p) },
  { key: 'special', label: 'Um símbolo: ! @ # $ % *', test: (p) => /[!@#$%*]/.test(p) },
  { key: 'chars', label: 'Sem acento nem espaço', test: (p) => p.length > 0 && /^[A-Za-z0-9!@#$%*]+$/.test(p) },
];

// CPFs com todos os dígitos iguais nunca são emitidos; no modo teste servem como CPF de teste.
export function isTestCpf(value) {
  return /^(\d)\1{10}$/.test(onlyDigits(value));
}

export function isValidCpf(value, { allowTestCpf = false } = {}) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  if (isTestCpf(cpf)) return allowTestCpf;
  const digit = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

export function isValidPhone(value) {
  const phone = onlyDigits(value);
  if (phone.length !== 10 && phone.length !== 11) return false;
  if (phone[0] === '0') return false;
  return phone.length === 10 || phone[2] === '9';
}

export function ageFrom(birth, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth || '');
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date > now) return null;
  let age = now.getUTCFullYear() - year;
  const m0 = now.getUTCMonth() + 1;
  if (m0 < month || (m0 === month && now.getUTCDate() < day)) age--;
  return age;
}

export function passwordError(password) {
  const missing = PASSWORD_RULES.filter((rule) => !rule.test(String(password ?? '')));
  return missing.length ? 'A senha precisa de: ' + missing.map((r) => r.label.toLowerCase()).join(', ') + '.' : '';
}

// Versão convite: só o e-mail e o aceite.
export function validateLead(input) {
  const data = {
    email: String(input.email ?? '').trim().toLowerCase(),
    whatsapp: onlyDigits(input.whatsapp).slice(0, 11), // opcional: o suporte chama se o jogador travar
    acceptedTerms: input.acceptedTerms === true,
  };
  const errors = {};
  if (!EMAIL_RE.test(data.email)) errors.email = 'Confira o e-mail.';
  if (data.whatsapp && !isValidPhone(data.whatsapp)) errors.whatsapp = 'WhatsApp com DDD, ex.: (11) 91234-5678. Ou deixe em branco.';
  if (!data.acceptedTerms) errors.acceptedTerms = 'Confirme que tem 18 anos ou mais e aceita os termos.';
  return { ok: Object.keys(errors).length === 0, errors, data };
}

// Cadastro: só o que a Suprema precisa para criar a conta.
export function validateSignup(input) {
  const data = {
    email: String(input.email ?? '').trim().toLowerCase(),
    password: String(input.password ?? ''),
    acceptedTerms: input.acceptedTerms === true,
  };
  const errors = {};

  if (!EMAIL_RE.test(data.email)) errors.email = 'Confira o e-mail.';
  const pwdError = passwordError(data.password);
  if (pwdError) errors.password = pwdError;
  if (!data.acceptedTerms) errors.acceptedTerms = 'Confirme que tem 18 anos ou mais e aceita os termos.';

  return { ok: Object.keys(errors).length === 0, errors, data };
}

// Dados do pagador: o Fichas 24h exige estes dados para processar o PIX (pedidos só no 1º depósito).
export function validatePayer(input, { allowTestCpf = false } = {}) {
  const data = {
    cpf: onlyDigits(input.cpf),
    phone: onlyDigits(input.phone),
    birth: String(input.birth ?? '').trim(),
  };
  const errors = {};

  if (!isValidCpf(data.cpf, { allowTestCpf })) errors.cpf = 'CPF inválido.';
  if (!isValidPhone(data.phone)) errors.phone = 'Celular com DDD, ex.: (11) 91234-5678.';
  const age = ageFrom(data.birth);
  if (age === null || age > 110) errors.birth = 'Data de nascimento inválida.';
  else if (age < 18) errors.birth = 'Só maiores de 18 anos podem jogar.';

  return { ok: Object.keys(errors).length === 0, errors, data };
}

export function maskCpf(value) {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

export function maskPhone(value) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
