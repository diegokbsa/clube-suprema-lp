// Identidade de cada blog de afiliado (12/11/2026, pedido do Kbsa: "padrão premium do premium, sem cara de IA").
// Um esqueleto editorial só ("ficha de conferência": cada indicação sai com quem conferiu, quando e o que conferir) e, por
// blog, a voz que assina (as mesmas do Telegram e do Instagram, em Suprema-360/03-PROJECTS/Active/painelafiliados-blogs/VOZES.md),
// a fonte de título e as cores tiradas do mundo do nicho. As fontes são servidas pelo próprio Portal (public/assets/fontes,
// recorte latin em woff2, licença OFL); o texto corrido é sempre Atkinson Hyperlegible Next.
//
// Cores: "acento" leva texto branco por cima (botão) e é a cor de link no fundo claro; "marca" é a segunda cor do nicho,
// usada em superfícies pequenas com "sobreMarca" por cima. Todas as combinações passam no AA (test/afiliacao-temas.test.mjs).

/** Fontes de título. arquivo = public/assets/fontes/<arquivo>.woff2; pesos = faixa do arquivo. */
export const FONTES = {
  'young-serif': { familia: 'Young Serif', pesos: '400', titulo: 400 },
  'archivo-narrow': { familia: 'Archivo Narrow', pesos: '600 700', titulo: 700 },
  gabarito: { familia: 'Gabarito', pesos: '700 800', titulo: 800 },
  'schibsted-grotesk': { familia: 'Schibsted Grotesk', pesos: '600 800', titulo: 800 },
  'bricolage-grotesque': { familia: 'Bricolage Grotesque', pesos: '600 800', titulo: 800 },
  'barlow-condensed': { familia: 'Barlow Condensed', pesos: '700', titulo: 700 },
  'chakra-petch': { familia: 'Chakra Petch', pesos: '700', titulo: 700 },
  'familjen-grotesk': { familia: 'Familjen Grotesk', pesos: '600 700', titulo: 700 },
  overpass: { familia: 'Overpass', pesos: '700 800', titulo: 800 },
  nunito: { familia: 'Nunito', pesos: '700 900', titulo: 900 },
};

// claro/escuro: fundo, papel (superfície), tinta (texto), suave (texto secundário), linha, acento, sobreAcento, marca, sobreMarca
export const TEMAS = {
  sublimacao: {
    voz: { nome: 'Léo da Estampa', curto: 'Léo', iniciais: 'LE', ele: 'o', papel: 'professor de bancada',
      jeito: 'Explica o porquê de cada ajuste e faz a conta do custo por peça antes de qualquer compra.', bordao: 'Na bancada hoje' },
    fonte: 'young-serif', medida: 0.94,
    // tinta de sublimação: ciano que vira teal no poliéster + magenta do CMY, sobre o branco frio do papel transfer
    claro: { fundo: '#f4f7f7', papel: '#ffffff', tinta: '#10292c', suave: '#47605f', linha: '#d5e0df', acento: '#0a6b74', sobreAcento: '#ffffff', marca: '#c2185b', sobreMarca: '#ffffff' },
    escuro: { fundo: '#0e1a1b', papel: '#142425', tinta: '#e3eeed', suave: '#9db5b3', linha: '#284040', acento: '#5cc8d0', sobreAcento: '#062124', marca: '#f06ea4', sobreMarca: '#2a0716' },
  },
  fornecedores: {
    voz: { nome: 'Márcio', curto: 'Márcio', iniciais: 'M', ele: 'o', papel: 'comprador pé no chão',
      jeito: 'Confia, mas confere: CNPJ, nota fiscal e amostra antes do lote.', bordao: 'Checklist do dia' },
    fonte: 'archivo-narrow', medida: 1.08,
    // depósito de atacado: caixa de papelão (kraft), concreto e o azul do carimbo de conferência
    claro: { fundo: '#f1f0ec', papel: '#ffffff', tinta: '#221f1a', suave: '#5b554c', linha: '#dcd8cf', acento: '#7a4a1e', sobreAcento: '#ffffff', marca: '#2457a6', sobreMarca: '#ffffff' },
    escuro: { fundo: '#171512', papel: '#1f1c18', tinta: '#efebe4', suave: '#b3aa9c', linha: '#383229', acento: '#e0a56a', sobreAcento: '#2a1706', marca: '#86aef0', sobreMarca: '#0c1a33' },
  },
  criativos: {
    voz: { nome: 'Nina', curto: 'Nina', iniciais: 'N', ele: 'a', papel: 'designer de anúncio',
      jeito: 'Design sem jargão: hierarquia, contraste e três cores resolvem quase tudo.', bordao: 'Ajuste rápido de hoje' },
    fonte: 'gabarito', medida: 1,
    // mesa de criação: folha branca, rosa de prova de cor e o amarelo do post-it de revisão
    claro: { fundo: '#fbfafa', papel: '#ffffff', tinta: '#181416', suave: '#5c5458', linha: '#e6e0e3', acento: '#ad1f4f', sobreAcento: '#ffffff', marca: '#f2b531', sobreMarca: '#2b1c00' },
    escuro: { fundo: '#151214', papel: '#1d191b', tinta: '#f1ebee', suave: '#b7a9b0', linha: '#352d31', acento: '#f27aa2', sobreAcento: '#33061a', marca: '#f5c55c', sobreMarca: '#2b1c00' },
  },
  ia: {
    voz: { nome: 'Duda', curto: 'Duda', iniciais: 'D', ele: 'a', papel: 'estudante curiosa de IA',
      jeito: 'Assume com humor que é uma IA e entrega o prompt pronto, com o que conferir na resposta.', bordao: 'Prompt do dia' },
    fonte: 'schibsted-grotesk', medida: 1,
    // caderno de estudo: grafite, folha pautada e o verde-limão do marca-texto
    claro: { fundo: '#f3f4f0', papel: '#ffffff', tinta: '#1b1f23', suave: '#535a61', linha: '#dde0d9', acento: '#2a333c', sobreAcento: '#ffffff', marca: '#d4ec4f', sobreMarca: '#1b2200' },
    escuro: { fundo: '#121416', papel: '#1a1d20', tinta: '#e9ecef', suave: '#a7afb7', linha: '#2f3439', acento: '#d4ec4f', sobreAcento: '#1b2200', marca: '#d4ec4f', sobreMarca: '#1b2200' },
  },
  achadinhos: {
    voz: { nome: 'Bia', curto: 'Bia', iniciais: 'B', ele: 'a', papel: 'amiga que entende de compra online',
      jeito: 'Desconfia de anúncio bonito demais: medida, avaliação com foto, frete e troca antes do clique.', bordao: 'Antes de clicar em comprar' },
    fonte: 'bricolage-grotesque', medida: 1,
    // corredor de loja: etiqueta amarela de preço e o vermelho-laranja do adesivo de oferta
    claro: { fundo: '#f7f6f3', papel: '#ffffff', tinta: '#1f1a17', suave: '#5e5650', linha: '#e3ddd6', acento: '#b8320f', sobreAcento: '#ffffff', marca: '#ffd23f', sobreMarca: '#2b2100' },
    escuro: { fundo: '#171311', papel: '#201b18', tinta: '#f4eee9', suave: '#b9ada5', linha: '#3a312b', acento: '#ff8a65', sobreAcento: '#2e0c02', marca: '#ffd23f', sobreMarca: '#2b2100' },
  },
  manutencao: {
    voz: { nome: 'Zé', curto: 'Zé', iniciais: 'Z', ele: 'o', papel: 'mecânico tranquilo',
      jeito: 'Segurança primeiro e sintoma antes da peça; diz quando é hora de chamar um profissional.', bordao: 'Recado da bancada' },
    fonte: 'barlow-condensed', medida: 1.1,
    // oficina: verde de máquina (torno, trator), aço e o amarelo das marcações de segurança
    claro: { fundo: '#eef0ec', papel: '#ffffff', tinta: '#1b211c', suave: '#515b53', linha: '#d6dbd3', acento: '#365440', sobreAcento: '#ffffff', marca: '#f2a900', sobreMarca: '#241900' },
    escuro: { fundo: '#121612', papel: '#1a1f1a', tinta: '#e8ede7', suave: '#a6b1a6', linha: '#2f372f', acento: '#8fc49c', sobreAcento: '#0b2112', marca: '#f2b632', sobreMarca: '#241900' },
  },
  gamer: {
    voz: { nome: 'Kaique', curto: 'Kaique', iniciais: 'K', ele: 'o', papel: 'streamer de setup simples',
      jeito: 'Animado sem gritar: respeita setup barato e mostra o ajuste que muda a live.', bordao: 'Dica de setup' },
    fonte: 'chakra-petch', medida: 1,
    // mesa de transmissão: o vermelho do "ao vivo" sobre o grafite da sala com a luz apagada
    claro: { fundo: '#f3f3f5', papel: '#ffffff', tinta: '#16161b', suave: '#55555f', linha: '#dfdfe5', acento: '#c41f2a', sobreAcento: '#ffffff', marca: '#16161b', sobreMarca: '#ffffff' },
    escuro: { fundo: '#0f0f13', papel: '#18181e', tinta: '#ececf2', suave: '#a9a9b6', linha: '#2c2c35', acento: '#ff5a62', sobreAcento: '#2a0306', marca: '#ececf2', sobreMarca: '#0f0f13' },
  },
  afiliado: {
    voz: { nome: 'Carla', curto: 'Carla', iniciais: 'C', ele: 'a', papel: 'afiliada anti-guru',
      jeito: 'Irônica com promessa milagrosa; mostra rastreio, rótulo de publicidade e conta de comissão sem enfeite.', bordao: 'Sem enrolação' },
    fonte: 'familjen-grotesk', medida: 1,
    // planilha e recibo: azul-marinho de livro-caixa e o vermelho da caneta de correção
    claro: { fundo: '#f5f5f3', papel: '#ffffff', tinta: '#141a22', suave: '#4f5866', linha: '#dde0e5', acento: '#1d3a5c', sobreAcento: '#ffffff', marca: '#c23b22', sobreMarca: '#ffffff' },
    escuro: { fundo: '#10141a', papel: '#171c24', tinta: '#e8ecf2', suave: '#a5afbd', linha: '#2b3340', acento: '#8fb4e3', sobreAcento: '#0b1a2c', marca: '#f0806b', sobreMarca: '#2c0a03' },
  },
  milhas: {
    voz: { nome: 'Rafa', curto: 'Rafa', iniciais: 'R', ele: 'o', papel: 'viajante que faz a conta',
      jeito: 'Calmo e matemático: faz a conta da milha com você e manda conferir no site oficial.', bordao: 'Faz a conta comigo' },
    fonte: 'overpass', medida: 1,
    // aeroporto: o amarelo das placas e do painel de embarque, o azul do céu de pista e o branco do cartão de embarque
    claro: { fundo: '#f2f5f7', papel: '#ffffff', tinta: '#121c24', suave: '#4c5a66', linha: '#d8e0e6', acento: '#0a5a87', sobreAcento: '#ffffff', marca: '#ffc61a', sobreMarca: '#211800' },
    escuro: { fundo: '#0d141a', papel: '#141d25', tinta: '#e6eef4', suave: '#a0b0be', linha: '#26333f', acento: '#6fc0ee', sobreAcento: '#04202f', marca: '#ffc61a', sobreMarca: '#211800' },
  },
  automacao: {
    voz: { nome: 'Gabi', curto: 'Gabi', iniciais: 'G', ele: 'a', papel: 'atendente organizada',
      jeito: 'Acolhedora e prática: entrega a mensagem pronta para copiar e a etiqueta certa para cada conversa.', bordao: 'Mensagem pronta' },
    fonte: 'nunito', medida: 0.98,
    // conversa de atendimento: o verde da mensagem enviada e o balão claro da resposta
    claro: { fundo: '#f1f4f1', papel: '#ffffff', tinta: '#152019', suave: '#4c5c51', linha: '#d8e1da', acento: '#0d6e39', sobreAcento: '#ffffff', marca: '#d9f5c8', sobreMarca: '#123018' },
    escuro: { fundo: '#0f1511', papel: '#161e18', tinta: '#e5efe7', suave: '#a0b3a5', linha: '#28342b', acento: '#6fd69a', sobreAcento: '#062012', marca: '#2b4a33', sobreMarca: '#dff5e6' },
  },
};

/** Séries da home: [nome, expressão no título]. Um post pode estar em mais de uma; série com menos de 2 posts não aparece. */
export const SERIES = {
  sublimacao: [['Canecas', 'caneca'], ['Camiseta e tecido', 'camiseta|tecido|algod|poli[eé]ster|chinelo'], ['Prensa, impressora e papel', 'prensa|impressora|tinta|papel|epson'], ['Vender e precificar', 'pre[cç]|vender|datas|fornecedor']],
  fornecedores: [['Achar fornecedor', 'fornecedor|atacado|br[aá]s'], ['Sem cair em golpe', 'golpe|nf-e|anatel|conferir|atras|autentic'], ['As contas da revenda', 'custo|investir|frete|estoque|pedido m[ií]nimo|calcular'], ['Vender acessórios', 'acess[oó]rio|semijoia|bolsa']],
  criativos: [['Carrossel', 'carrossel'], ['Feed e identidade', 'feed|identidade|fonte|padr[aã]o|portf[oó]lio'], ['Canva e ferramentas', 'canva|ferramenta|powerpoint|mesa digital'], ['Stories e formatos', 'stories|formato|tamanho|qualidade|exportar']],
  ia: [['Prompts', 'prompt'], ['Estudar com IA', 'estudar|resumir|transcrever|concurso|programa[cç]'], ['Imagem, voz e vídeo', 'v[ií]deo|foto|imagem|voice|microfone'], ['IA no negócio', 'neg[oó]cio|empresa|loja|renda']],
  achadinhos: [['Shopee', 'shopee'], ['TikTok Shop', 'tiktok'], ['Gravar e editar', 'v[ií]deo|ring light|trip[eé]|gravar|carrossel'], ['Comprar com cuidado', 'original|checklist|conferir|br[aá]s']],
  manutencao: [['Roçadeira', 'ro[cç]adeira'], ['Motosserra', 'motosserra'], ['Ar-condicionado', 'ar-condicionado|ar condicionado'], ['Ferramentas', 'mult[ií]metro|alicate|ferramenta|solda|eletro']],
  gamer: [['OBS na prática', 'obs'], ['Live no console e no celular', 'ps5|celular|console'], ['Microfone, câmera e luz', 'microfone|webcam|ring light|c[aâ]mera|bra[cç]o|captura'], ['Fazer o canal crescer', 'crescer|agendar|twitch|youtube']],
  afiliado: [['Começar do zero', 'zero|iniciante|erros|escolher produto|furada'], ['Divulgar sem guru', 'instagram|pinterest|divulgar|bio|blog|review|transpar'], ['Medir e rastrear', 'rastrear|e-mail|p[aá]gina|captura|automa'], ['Imposto e saque', 'imposto|mei|sacar|declarar']],
  milhas: [['Juntar milhas', 'juntar|programas|comprar milhas|livelo|transferir'], ['Emitir passagem', 'passagem|emitir|pesquisar'], ['Regras e validade', 'expiram|validade|cancelar|clube'], ['Morar e estudar fora', 'espanha|ingl[eê]s|fluency']],
  automacao: [['WhatsApp Business', 'etiqueta|cat[aá]logo|sauda[cç]|aus[eê]ncia|respostas r[aá]pidas|pedidos'], ['Chatbot', 'chatbot'], ['CRM e integrações', 'crm|planilha|agenda|integra|formul'], ['Regras e custos', 'banimento|api|custo|gr[aá]tis|entregue']],
};

/** Tema do blog pelo slug; blog sem tema cai num neutro com a cor do vitrine.json. */
export function temaDe(blog, v = {}) {
  const t = TEMAS[blog];
  if (t) return t;
  const a = v.cor || '#1d3a5c';
  return { voz: null, fonte: 'familjen-grotesk', medida: 1,
    claro: { fundo: '#f5f5f3', papel: '#ffffff', tinta: '#15171c', suave: '#4f5563', linha: '#e0e2e6', acento: a, sobreAcento: '#ffffff', marca: a, sobreMarca: '#ffffff' },
    escuro: { fundo: '#121417', papel: '#1a1d21', tinta: '#e9ecef', suave: '#a7afb7', linha: '#2f3439', acento: '#9fb7d6', sobreAcento: '#0b1a2c', marca: '#9fb7d6', sobreMarca: '#0b1a2c' } };
}

// ---- contraste WCAG (usado no teste e para conferir tema novo) ----
const canal = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * canal(n >> 16) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255); };
export const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
