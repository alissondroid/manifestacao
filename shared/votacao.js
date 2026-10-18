// Simulador de votação (educativo, não oficial): mapa, etapas e a urna, compartilhados por cliente e servidor.
// Candidatos, partidos e números são FICTÍCIOS. Nenhum voto é guardado.

export const STAGES = ['casa', 'rua', 'patio', 'fila', 'corredor', 'secao', 'habilitado', 'urna', 'votou', 'fim'];

export const SECOES = ['0101', '0102', '0103', '0104'];
const ROOM_X = [-10.5, -3.5, 3.5, 10.5]; // centro de cada sala de seção
const ROOM_HALF = 3.0;

/** Lugares do mapa (metros). +z é "para frente": casa → rua → escola. */
export const PLACES = {
  house: { x0: -3.8, x1: 3.8, z0: -13.8, z1: -6.4 },
  spawn: { x: 0, z: -10.2, ry: 0 },
  mesa: { x: -2.6, z: -11.4, r: 1.8 },
  porta: { x: 0, z: -6.6, r: 1.8 },
  streetX: 4.8,
  gateZ: 59.6, // cruzar esta linha é passar pelo portão da escola
  gateX: 3.0,
  yard: { x0: -13, x1: 13, z0: 59.4, z1: 89 },
  filaEntrada: { x: 0, z: 74, r: 3.6 },
  buildingDoor: { x0: -1.4, x1: 1.4, z0: 89, z1: 91.2 },
  corridor: { x0: -13.5, x1: 13.5, z0: 91.2, z1: 95 },
  corridorSpawn: { x: 0, z: 93, ry: 0 },
  saida: { x: 0, z: 61.2, r: 3.6 },
  panfleteiro: { x: 3.4, z: 53, r: 2.2 }, // distribui santinho no dia da eleição (boca de urna é proibida)
  roomZ0: 95,
  roomZ1: 107,
  roomX: ROOM_X,
  roomHalf: ROOM_HALF,
};

export const room = (i) => ({
  x0: ROOM_X[i] - ROOM_HALF, x1: ROOM_X[i] + ROOM_HALF, z0: PLACES.roomZ0, z1: PLACES.roomZ1,
});
/** Mesa do mesário e cabine de votação da sala i. */
export const mesaria = (i) => ({ x: ROOM_X[i], z: 104.6, r: 2.6 });
export const cabine = (i) => ({ x: ROOM_X[i] + 2.1, z: 99, r: 1.7 });
export const roomDoor = (i) => ({ x: ROOM_X[i], z: PLACES.roomZ0, half: 0.9 });

/** A fila: do guichê (posição 0) para trás, em linha reta no pátio. */
export const QUEUE = {
  slots: 16, laneX: 0, frontZ: 88.2, step: 1.05, advanceMs: 6000, npcStart: 9, minNpc: 5,
};
export const queueSpot = (idx) => ({ x: QUEUE.laneX, z: QUEUE.frontZ - QUEUE.step * idx, ry: 0 });

/** Retângulos por onde cada etapa pode andar: é isso que impede pular etapas. */
export function boundsFor(stage, secaoIdx = 0) {
  const P = PLACES;
  const house = P.house;
  const doorGap = { x0: -0.9, x1: 0.9, z0: house.z1, z1: house.z1 + 0.7 };
  const street = { x0: -P.streetX, x1: P.streetX, z0: house.z1 + 0.6, z1: P.gateZ };
  const gate = { x0: -P.gateX, x1: P.gateX, z0: P.gateZ - 0.1, z1: P.yard.z0 + 0.6 };
  const rooms = [0, 1, 2, 3].map(room);
  switch (stage) {
    case 'casa': return [house];
    case 'rua': return [house, doorGap, street, gate];
    case 'patio': case 'fila': return [P.yard, gate];
    case 'corredor': return [P.corridor, ...rooms];
    case 'secao': case 'habilitado': case 'urna': return [room(secaoIdx)];
    case 'votou': return [room(secaoIdx), P.corridor, P.buildingDoor, P.yard, gate];
    default: return [house, doorGap, street, gate, P.yard]; // fim
  }
}

/** Ponto mais próximo de (x, z) dentro de algum dos retângulos. */
export function clampPos(rects, x, z) {
  let best = null;
  for (const r of rects) {
    const cx = Math.min(r.x1, Math.max(r.x0, x));
    const cz = Math.min(r.z1, Math.max(r.z0, z));
    const d = (cx - x) ** 2 + (cz - z) ** 2;
    if (!best || d < best.d) best = { x: cx, z: cz, d };
  }
  return { x: best.x, z: best.z };
}

export const near = (p, place, slack = 0.8) => Math.hypot(p.x - place.x, p.z - place.z) <= (place.r ?? 1.5) + slack;

// ---------- Urna (candidatos fictícios) ----------

export const PARTIDOS = {
  62: { sigla: 'PHZ', nome: 'Partido Horizonte', cor: '#2f7fd1' },
  74: { sigla: 'UCP', nome: 'União Cidadã Progressista', cor: '#d9822b' },
  58: { sigla: 'MRB', nome: 'Movimento Raízes do Brasil', cor: '#3a9b5c' },
  83: { sigla: 'FBS', nome: 'Frente Brasil Solidário', cor: '#a04bb8' },
};

export const CARGOS = [
  {
    id: 'dep-federal', nome: 'Deputado Federal', digitos: 4,
    candidatos: [
      { numero: '6212', nome: 'Helena Prado' },
      { numero: '7434', nome: 'Roberto Salles' },
      { numero: '5811', nome: 'Ana Beatriz Lima' },
    ],
  },
  {
    id: 'senador', nome: 'Senador', digitos: 3,
    candidatos: [
      { numero: '621', nome: 'Carlos Mendonça' },
      { numero: '743', nome: 'Lúcia Ferraz' },
      { numero: '831', nome: 'Joaquim Tavares' },
    ],
  },
  {
    id: 'governador', nome: 'Governador', digitos: 2,
    candidatos: [
      { numero: '62', nome: 'Marina Duarte' },
      { numero: '74', nome: 'Paulo Cavalcanti' },
      { numero: '58', nome: 'Teresa Nogueira' },
      { numero: '83', nome: 'Rui Almeida' },
    ],
  },
  {
    id: 'presidente', nome: 'Presidente', digitos: 2,
    candidatos: [
      { numero: '62', nome: 'Sofia Albuquerque' },
      { numero: '74', nome: 'Antônio Bezerra' },
      { numero: '58', nome: 'Isabel Camargo' },
      { numero: '83', nome: 'Henrique Vasconcelos' },
    ],
  },
];

const partidoDe = (numero) => PARTIDOS[Number(numero.slice(0, 2))] ?? null;

/** O que a urna mostra para os dígitos digitados num cargo. */
export function consulta(cargo, digitos) {
  if (digitos.length < cargo.digitos) return { status: 'digitando' };
  const cand = cargo.candidatos.find((c) => c.numero === digitos);
  if (cand) return { status: 'candidato', candidato: cand, partido: partidoDe(cand.numero) };
  const partido = partidoDe(digitos);
  return { status: 'nulo', partido: cargo.digitos <= 2 ? null : partido }; // número sem candidato
}

/**
 * Máquina da urna: uma tela por cargo. `branco()` só com a tela vazia; `corrige()` apaga tudo;
 * `confirma()` só com o número completo (ou branco). Ao fim de todos os cargos, `done` fica true.
 * Os votos ficam só aqui, na memória da urna: nada é enviado nem guardado.
 */
export function criarUrna(cargos = CARGOS) {
  const s = { i: 0, digitos: '', branco: false, done: false, votos: [] };
  const cargo = () => cargos[s.i];
  const view = () => {
    if (s.done) return { done: true };
    const c = cargo();
    return {
      done: false,
      cargo: c.nome,
      posicao: s.i + 1,
      total: cargos.length,
      digitos: s.digitos,
      tamanho: c.digitos,
      branco: s.branco,
      ...(s.branco ? { status: 'branco' } : consulta(c, s.digitos)),
    };
  };
  return {
    view,
    get votos() { return s.votos.map((v) => ({ ...v })); },
    digita(d) {
      if (s.done || s.branco || !/^\d$/.test(String(d)) || s.digitos.length >= cargo().digitos) return view();
      s.digitos += String(d);
      return view();
    },
    corrige() {
      if (!s.done) { s.digitos = ''; s.branco = false; }
      return view();
    },
    brancoBtn() {
      if (!s.done && s.digitos === '') s.branco = true;
      return view();
    },
    confirma() {
      if (s.done) return view();
      const v = view();
      const pronto = s.branco || v.status === 'candidato' || v.status === 'nulo';
      if (!pronto) return { ...v, recusou: true };
      s.votos.push({ cargo: cargo().id, tipo: s.branco ? 'branco' : v.status === 'nulo' ? 'nulo' : 'candidato', numero: s.digitos });
      s.i += 1;
      s.digitos = '';
      s.branco = false;
      if (s.i >= cargos.length) s.done = true;
      return { ...view(), confirmou: true };
    },
  };
}
