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

// ---------- Visual dos personagens (tudo é índice nestas listas) ----------

export const BODIES = ['Masculino', 'Feminino'];
export const AGES = ['Adulto', 'Idoso'];
// Modelos humanos disponíveis por corpo; `look.face` escolhe o índice na lista.
export const MODELS = { male: ['rpm', 'ch33', 'ch08', 'renan', 'bolsonaro', 'lula'], female: ['ch02', 'ch16'] };
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
export const ANIMS = ['idle', 'walk', 'wave', 'dance', 'clap', 'drive'];

export const WALK_SPEED = 5;
export const RUN_SPEED = 8;
export const MAX_SPEED = 9; // limite validado pelo servidor

export const LIMITS = {
  nick: 16,
  chat: 140,
  sign: 24,
  chatCooldownMs: 1200,
};

// ---------- Loja de itens cosméticos ----------

// Cada slot aceita um item equipado por vez.
export const SLOTS = ['head', 'face', 'shirt', 'flag', 'sign'];

// price em centavos de BRL. O servidor é a fonte da verdade: o cliente só exibe.
export const SHOP = [
  { id: 'camisa-brasil', slot: 'shirt', name: 'Camisa amarela', price: 400, color: '#f2c20f', icon: '👕' },
  { id: 'camisa-numero', slot: 'shirt', name: 'Camisa do candidato', price: 400, icon: '🎽' },
  { id: 'camisa-simples', slot: 'shirt', name: 'Camisa simples', price: 200, icon: '👚', custom: 'plainshirt' },
  { id: 'camisa-custom', slot: 'shirt', name: 'Sua camisa', price: 400, icon: '🎨', custom: 'shirt' },
  { id: 'bone', slot: 'head', name: 'Boné do time', price: 300, icon: '🧢' },
  { id: 'chapeu-palha', slot: 'head', name: 'Chapéu de palha', price: 300, icon: '👒' },
  { id: 'oculos', slot: 'face', name: 'Óculos escuros', price: 200, icon: '🕶️' },
  { id: 'bandeira-gigante', slot: 'flag', name: 'Bandeira gigante', price: 400, icon: '🚩' },
  { id: 'cartaz-custom', slot: 'sign', name: 'Seu cartaz', price: 200, icon: '🪧', custom: 'sign' },
  { id: 'bandeira-custom', slot: 'flag', name: 'Sua bandeira', price: 400, icon: '🏳️', custom: 'flag' },
];

// Cartaz, bandeira e camisa personalizados: o que o jogador pode escolher (validado no servidor).
// `kind` do desenho -> item da loja que precisa ter sido comprado.
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
