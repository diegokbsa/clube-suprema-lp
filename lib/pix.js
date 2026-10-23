// Gera um "PIX copia e cola" no formato do Banco Central (EMV), só para o modo teste.
// A chave "modo-teste-nao-pague" não existe, então nenhum banco aceita pagar este código.

function field(id, value) {
  return id + String(value.length).padStart(2, '0') + value;
}

function crc16(payload) {
  let crc = 0xffff;
  for (const byte of Buffer.from(payload, 'utf8')) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function buildMockPixPayload({ amount, txid }) {
  const body =
    field('00', '01') +
    field('26', field('00', 'br.gov.bcb.pix') + field('01', 'modo-teste-nao-pague')) +
    field('52', '0000') +
    field('53', '986') +
    field('54', amount.toFixed(2)) +
    field('58', 'BR') +
    field('59', 'TESTE NAO PAGUE') +
    field('60', 'SOROCABA') +
    field('62', field('05', txid.slice(0, 25))) +
    '6304';
  return body + crc16(body);
}
