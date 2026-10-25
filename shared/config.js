// Constantes compartilhadas entre cliente e servidor.

export const WORLD = {
  halfWidth: 19, // área caminhável em X (pista + calçadas)
  halfLength: 118, // área caminhável em Z
};

// Os lados da manifestação. `num` é o que vai no peito da camisa e nas bandeiras.
export const SIDES = [
  { id: 0, name: 'Petista', short: 'Petista', num: '13', color: '#d7192b' },
  { id: 1, name: 'Bolsonarista', short: 'Bolsonarista', num: '22', color: '#169b45' },
  { id: 2, name: 'Anarquistas', short: 'Anarquia', num: 'Ⓐ', color: '#1a1a1a' },
  { id: 3, name: 'Sem partido', short: 'Sem partido', num: 'BR', color: '#7c8aa0' },
];

/** Nomes curtos dos lados para links de convite (?lado=). */
export const SIDE_SLUGS = ['petista', 'bolsonarista', 'anarquia', 'sem-partido'];

// ---------- Visual dos personagens (tudo é índice nestas listas) ----------

export const BODIES = ['Masculino', 'Feminino'];
export const AGES = ['Adulto', 'Idoso'];
// Modelos humanos disponíveis por corpo; `look.face` escolhe o índice na lista.
export const MODELS = { male: ['rpm'], female: ['ubcf'] };
export const HEIGHTS = ['Baixo', 'Médio', 'Alto'];
// Tons de pele que representam a diversidade brasileira, do mais claro ao mais escuro.
export const SKINS = ['#f3d2b8', '#e5b48c', '#c98d62', '#a56c43', '#7b4a2d', '#503020'];
export const HAIR_STYLES = ['Curto', 'Raspado', 'Careca', 'Cacheado', 'Longo', 'Rabo de cavalo', 'Coque'];
export const HAIRS = ['#16120f', '#3b2616', '#6b4423', '#b98a3e', '#8a3b1e', '#b9b9b9'];
export const BEARDS = ['Sem barba', 'Bigode', 'Barba'];
export const SHIRTS = ['#f4f4f2', '#1f2933', '#f2c20f', '#1e8a47', '#d7192b', '#2f5fbf', '#e86aa6'];
export const TOPS = ['Camiseta', 'Regata'];
// Cor da bermuda (todos os personagens comuns usam camiseta e bermuda).
export const PANTS = [
  { name: 'Jeans', color: '#35507a' },
  { name: 'Cáqui', color: '#b9a37c' },
  { name: 'Preta', color: '#20252b' },
  { name: 'Jeans claro', color: '#4b6b9c' },
];
export const FLAGS = ['Sem bandeira', 'Bandeira do Brasil', 'Bandeira do candidato', 'Cartaz', 'Picanha no espeto', 'Abóbora'];

// Índice enviado pela rede em vez do nome.
export const ANIMS = ['idle', 'walk', 'wave', 'dance', 'clap', 'drive', 'dance2', 'call', 'yes', 'no', 'jump'];
// Gestos do menu 😀/🎭.
export const EMOTES = [
  { anim: 2, icon: '👋', name: 'Acenar', key: '1' },
  { anim: 3, icon: '💃', name: 'Dançar', key: '2' },
  { anim: 6, icon: '🕺', name: 'Dança 2' },
  { anim: 7, icon: '📣', name: 'Chamar' },
  { anim: 8, icon: '🙆', name: 'Concordar' },
  { anim: 9, icon: '🙅', name: 'Negar' },
];
export const JUMP = { anim: 10, ms: 700, height: 0.85 };

export const WALK_SPEED = 5;
export const RUN_SPEED = 8;
export const MAX_SPEED = 9; // limite validado pelo servidor
export const SPEED_SLACK = 1.25; // tolerância sobre o limite (lag e arredondamento)

/** Frases prontas do cartaz. Texto próprio pelo item "Seu cartaz". */
export const SIGN_PRESETS = [
  'Fora a inflação',
  'Mais saúde, menos imposto',
  'Respeito ao povo',
  'Avenida de todos',
  'Paz e democracia',
  'Deus, pátria e família',
  'Educação em primeiro lugar',
  'Chega de corrupção',
];

/** Figurantes da multidão por nível de qualidade (0 = máximo): a avenida enche mais em aparelhos bons. */
export const CROWD = { counts: [220, 170, 110, 70] };
/** Figurantes especiais (sempre visíveis): vendedores de água, duplas de policiais e equipes de reportagem (repórter + câmera). */
export const NPCS = { water: 6, policePairs: 5, pressTeams: 3 };

export const LIMITS = {
  nick: 16,
  chat: 140,
  sign: 24,
  chatCooldownMs: 1200,
};

// ---------- Itens cosméticos ----------

// Cada slot aceita um item equipado por vez.
export const SLOTS = ['head', 'face', 'shirt', 'back', 'flag', 'sign', 'fx', 'badge', 'car'];
export const SLOT_NAMES = {
  head: 'Cabeça', face: 'Rosto', shirt: 'Camisa', back: 'Costas', flag: 'Bandeira', sign: 'Cartaz', fx: 'Efeito', badge: 'Selo', car: 'Carro',
};

// Itens cosméticos: qualquer jogador com conta equipa o que quiser (um por slot). O servidor valida o slot.
export const SHOP = [
  { id: 'camisa-brasil', slot: 'shirt', name: 'Camisa amarela', color: '#f2c20f', icon: '👕' },
  { id: 'camisa-numero', slot: 'shirt', name: 'Camisa do candidato', icon: '🎽' },
  { id: 'camisa-simples', slot: 'shirt', name: 'Camisa simples', icon: '👚', custom: 'plainshirt' },
  { id: 'camisa-custom', slot: 'shirt', name: 'Sua camisa', icon: '🎨', custom: 'shirt' },
  { id: 'bone', slot: 'head', name: 'Boné do time', icon: '🧢' },
  { id: 'chapeu-palha', slot: 'head', name: 'Chapéu de palha', icon: '👒' },
  { id: 'cartola', slot: 'head', name: 'Cartola', icon: '🎩' },
  { id: 'capacete', slot: 'head', name: 'Capacete de obra', icon: '⛑️' },
  { id: 'bandana', slot: 'head', name: 'Faixa na cabeça', icon: '🎀' },
  { id: 'coroa', slot: 'head', name: 'Coroa', icon: '👑' },
  { id: 'oculos', slot: 'face', name: 'Óculos escuros', icon: '🕶️' },
  { id: 'oculos-aviador', slot: 'face', name: 'Óculos aviador', icon: '😎' },
  { id: 'mascara-festa', slot: 'face', name: 'Máscara de festa', icon: '🎭' },
  { id: 'mochila', slot: 'back', name: 'Mochila', icon: '🎒' },
  { id: 'capa', slot: 'back', name: 'Capa do lado', icon: '🦸' },
  { id: 'asas', slot: 'back', name: 'Asas', icon: '🪽' },
  { id: 'bandeira-gigante', slot: 'flag', name: 'Bandeira gigante', icon: '🚩' },
  { id: 'cartaz-custom', slot: 'sign', name: 'Seu cartaz', icon: '🪧', custom: 'sign' },
  { id: 'bandeira-custom', slot: 'flag', name: 'Sua bandeira', icon: '🏳️', custom: 'flag' },
  { id: 'aura-lado', slot: 'fx', name: 'Aura do lado', icon: '🔵' },
  { id: 'aura-dourada', slot: 'fx', name: 'Aura dourada', icon: '✨' },
  { id: 'badge-raiz', slot: 'badge', name: 'Selo Raiz', icon: '🔥' },
  { id: 'badge-picanha', slot: 'badge', name: 'Selo Picanha', icon: '🥩' },
  { id: 'badge-diamante', slot: 'badge', name: 'Selo Diamante', icon: '💎' },
  { id: 'carro-dourado', slot: 'car', name: 'Carro dourado', icon: '🚕' },
  { id: 'carro-som', slot: 'car', name: 'Carro de som', icon: '📢' },
];
// Cartaz, bandeira e camisa personalizados: o que o jogador pode escolher (validado no servidor).
// `kind` do desenho -> item que ele personaliza.
export const DESIGN = {
  signMax: 40,
  flagMax: 16,
  shirtMax: 12,
  items: { sign: 'cartaz-custom', flag: 'bandeira-custom', shirt: 'camisa-custom', plainshirt: 'camisa-simples' },
  emblems: ['', '⭐', '🇧🇷', '✊', '❤️', 'Ⓐ', '☮️', '✌️', '🔥'],
  colors: ['#ffffff', '#1c1917', '#d7192b', '#169b45', '#f2c20f', '#2f5fbf', '#7c3aed', '#e86aa6', '#f97316', '#111111'],
};

// Modos extras.
export const RACE = {
  startZ: -100,
  finishZ: 100,
  waitMs: 15000, // espera por mais corredores
  countdownMs: 4000,
  maxMs: 90000,
};
export const PVP = {
  range: 18,
  radius: 0.9,
  cooldownMs: 1200,
};
// Golpes corpo a corpo (só contam com o PvP ligado nos dois): alcance e arco à frente do atacante,
// empurrão aplicado ao alvo e tempo em que ele fica atordoado (sem andar).
export const MELEE = {
  punch: { name: 'Murro', reach: 1.8, arc: 1.0, push: 1.3, cooldownMs: 600, stunMs: 600, durMs: 550 },
  kick: { name: 'Chute', reach: 2.1, arc: 0.9, push: 2.0, cooldownMs: 900, stunMs: 800, durMs: 700 },
  baton: { name: 'Cassetete', reach: 2.3, arc: 1.1, push: 1.6, cooldownMs: 800, stunMs: 700, durMs: 650 },
  car: { name: 'Atropelamento', reach: 1.6, arc: 3.2, push: 2.8, cooldownMs: 1500, stunMs: 1200, durMs: 0 },
};
// Carro: física simples no cliente, limite de velocidade validado no servidor.
export const VEHICLE = { maxSpeed: 16, reverse: 4, accel: 7, brake: 14, drag: 1.2, turnRate: 1.7, minHitSpeed: 3 };
// Vida no PvP: cada golpe tira pontos; a 0 o jogador é nocauteado, volta do ponto de entrada e fica protegido por um tempo.
export const COMBAT = {
  hp: 100,
  regenDelayMs: 6000, // sem apanhar por esse tempo, a vida volta sozinha
  regenPerSec: 6,
  koMs: 4000,
  shieldMs: 3000,
  leaveLockMs: 8000, // não dá para desligar o PvP logo depois de apanhar
  koBonus: 3, // pontos extras do lado de quem nocauteia
  dmg: { tomato: 12, punch: 10, kick: 16, baton: 18, car: 30 },
};
// Domínio da Paulista: o lado com mais gente no trecho (bandeira conta em dobro) toma o controle e pontua a cada segundo.
export const ZONES = [
  { id: 0, name: 'Consolação', tag: 'Cons.', z: -100 },
  { id: 1, name: 'MASP', tag: 'MASP', z: -26 },
  { id: 2, name: 'Brigadeiro', tag: 'Brig.', z: 25 },
  { id: 3, name: 'Gazeta', tag: 'Gaz.', z: 70 },
  { id: 4, name: 'Paraíso', tag: 'Para.', z: 108 },
];
export const ZONE = { radius: 18, tickMs: 1000, capture: 7, neutralNeeded: 35, startHold: 35 };
export const REACTIONS = ['👍', '😂', '🔥', '❤️', '😡', '🇧🇷', '✊', '🎉'];
// Fôlego: correr gasta, andar recupera; esgotado, só volta a correr depois de `resume`.
export const STAMINA = { max: 100, drain: 26, regen: 16, resume: 25 };
export const SHOP_BY_ID = Object.fromEntries(SHOP.map((i) => [i.id, i]));

export const ACCOUNT = {
  nickMin: 3,
  nickMax: 16,
  passwordMin: 8,
};
