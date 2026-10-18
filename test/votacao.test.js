import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CARGOS, PLACES, QUEUE, boundsFor, clampPos, consulta, criarUrna, queueSpot, room, SECOES,
} from '../shared/votacao.js';

test('candidatos são fictícios, têm número do tamanho do cargo e sem repetição por cargo', () => {
  for (const c of CARGOS) {
    const nums = c.candidatos.map((x) => x.numero);
    assert.equal(new Set(nums).size, nums.length, c.id);
    for (const n of nums) assert.equal(n.length, c.digitos, `${c.id} ${n}`);
  }
  assert.deepEqual(CARGOS.map((c) => c.digitos), [4, 3, 2, 2]);
});

test('consulta: digitando, candidato e número sem candidato (nulo)', () => {
  const gov = CARGOS.find((c) => c.id === 'governador');
  assert.equal(consulta(gov, '6').status, 'digitando');
  const ok = consulta(gov, '62');
  assert.equal(ok.status, 'candidato');
  assert.equal(ok.candidato.nome, 'Marina Duarte');
  assert.equal(consulta(gov, '99').status, 'nulo');
});

test('urna: vota nos 4 cargos (candidato, nulo, branco) e guarda só na memória', () => {
  const u = criarUrna();
  assert.equal(u.view().cargo, 'Deputado Federal');
  '6212'.split('').forEach((d) => u.digita(d));
  assert.equal(u.view().status, 'candidato');
  assert.equal(u.confirma().confirmou, true);
  assert.equal(u.view().cargo, 'Senador');
  u.digita(9); u.digita(9); u.digita(9);
  assert.equal(u.view().status, 'nulo');
  u.confirma();
  assert.equal(u.view().cargo, 'Governador');
  u.brancoBtn();
  assert.equal(u.view().status, 'branco');
  u.confirma();
  u.digita(5); u.digita(8);
  const fim = u.confirma();
  assert.equal(fim.done, true);
  assert.deepEqual(u.votos.map((v) => v.tipo), ['candidato', 'nulo', 'branco', 'candidato']);
});

test('urna: confirma incompleto é recusado; corrige apaga; branco só com a tela vazia', () => {
  const u = criarUrna();
  u.digita(6);
  assert.equal(u.confirma().recusou, true);
  u.brancoBtn();
  assert.equal(u.view().branco, false, 'com dígito digitado, branco não vale');
  u.corrige();
  assert.equal(u.view().digitos, '');
  u.brancoBtn();
  assert.equal(u.view().branco, true);
  u.digita(1);
  assert.equal(u.view().digitos, '', 'depois do branco não aceita número');
  u.corrige();
  assert.equal(u.view().branco, false);
  for (let i = 0; i < 9; i += 1) u.digita(1);
  assert.equal(u.view().digitos.length, 4, 'não passa do tamanho do cargo');
});

test('clampPos mantém dentro do retângulo mais próximo', () => {
  const r = [{ x0: 0, x1: 2, z0: 0, z1: 2 }, { x0: 10, x1: 12, z0: 0, z1: 2 }];
  assert.deepEqual(clampPos(r, -5, 1), { x: 0, z: 1 });
  assert.deepEqual(clampPos(r, 9, 1), { x: 10, z: 1 });
  assert.deepEqual(clampPos(r, 1, 1), { x: 1, z: 1 });
});

test('cada etapa só enxerga a sua parte do mapa (não dá para pular etapas)', () => {
  const casa = boundsFor('casa');
  const fora = clampPos(casa, 0, 20);
  assert.ok(fora.z <= PLACES.house.z1, 'de casa não chega à rua');
  const rua = boundsFor('rua');
  assert.ok(clampPos(rua, 0, 80).z <= PLACES.gateZ + 0.7, 'da rua não passa do portão sozinho');
  const sala = boundsFor('secao', 2);
  const p = clampPos(sala, 0, 100);
  assert.ok(p.x >= room(2).x0 && p.x <= room(2).x1, 'na seção, só na própria sala');
  assert.equal(SECOES.length, 4);
});

test('a fila anda em linha reta para o guichê', () => {
  assert.equal(queueSpot(0).z, QUEUE.frontZ);
  assert.ok(queueSpot(5).z < queueSpot(4).z);
  assert.ok(queueSpot(QUEUE.slots - 1).z > PLACES.yard.z0, 'a última vaga ainda fica dentro do pátio');
});
